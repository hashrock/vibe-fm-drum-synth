import type { OperatorParams, LFOParams, PitchEnvelopeParams, FMAlgorithm } from './types';

export type { OperatorParams, LFOParams, PitchEnvelopeParams, FMAlgorithm } from './types';

export class FMSynth {
  private audioContext: AudioContext;
  private operators: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private envelopes: GainNode[] = [];
  private feedbackNodes: DelayNode[] = [];
  private feedbackGains: GainNode[] = [];
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private masterGain: GainNode;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
    this.masterGain = audioContext.createGain();
    this.masterGain.connect(audioContext.destination);
    this.masterGain.gain.value = 0.25;
  }

  trigger(
    baseFrequency: number,
    duration: number,
    operatorParams: OperatorParams[],
    lfoParams: LFOParams,
    algorithm: FMAlgorithm = 'serial',
    pitchEnvelope?: PitchEnvelopeParams
  ) {
    const currentTime = this.audioContext.currentTime;

    const tempOperators: OscillatorNode[] = [];
    const tempGains: GainNode[] = [];
    const tempEnvGains: GainNode[] = [];
    const modGains: GainNode[] = [];

    // Create all 4 operators first
    for (let i = 0; i < 4; i++) {
      const params = operatorParams[i];

      // Oscillator
      const osc = this.audioContext.createOscillator();
      osc.frequency.value = baseFrequency * params.ratio;

      // Apply pitch envelope if provided
      if (pitchEnvelope && pitchEnvelope.depth > 0) {
        const pitchDepth = baseFrequency * params.ratio * pitchEnvelope.depth;
        osc.frequency.setValueAtTime(baseFrequency * params.ratio + pitchDepth, currentTime);
        osc.frequency.linearRampToValueAtTime(
          baseFrequency * params.ratio + pitchDepth * 0.5,
          currentTime + pitchEnvelope.attack
        );
        osc.frequency.linearRampToValueAtTime(
          baseFrequency * params.ratio,
          currentTime + pitchEnvelope.attack + pitchEnvelope.decay
        );
      }

      // Envelope gain
      const envGain = this.audioContext.createGain();
      envGain.gain.value = 0;

      // Operator output gain
      const opGain = this.audioContext.createGain();
      opGain.gain.value = params.level;

      // Feedback
      const feedbackDelay = this.audioContext.createDelay();
      feedbackDelay.delayTime.value = 0.001;
      const feedbackGain = this.audioContext.createGain();
      feedbackGain.gain.value = params.feedbackAmount;

      // Connect feedback loop
      osc.connect(feedbackDelay);
      feedbackDelay.connect(feedbackGain);
      feedbackGain.connect(feedbackDelay);

      // Main signal path
      osc.connect(envGain);
      feedbackDelay.connect(envGain);
      envGain.connect(opGain);

      tempOperators.push(osc);
      tempGains.push(opGain);
      tempEnvGains.push(envGain);

      this.operators.push(osc);
      this.gains.push(opGain);
      this.envelopes.push(envGain);
      this.feedbackNodes.push(feedbackDelay);
      this.feedbackGains.push(feedbackGain);

      // AD Envelope - Trigger mode with minimal release
      const attack = params.attack;
      const decay = params.decay; // User-controllable decay
      const release = 0.05; // Fixed minimal release

      // Envelope times
      const attackTime = Math.max(0, attack);
      const decayTime = Math.max(0, decay);
      const releaseTime = release;

      const attackEnd = currentTime + attackTime;
      const decayEnd = attackEnd + decayTime;
      const releaseStart = currentTime + duration; // Release starts when note ends
      const releaseEnd = releaseStart + releaseTime;

      // Attack: 0 -> 1
      envGain.gain.setValueAtTime(0, currentTime);
      envGain.gain.linearRampToValueAtTime(1, attackEnd);

      // Decay: 1 -> 0.2 (sustain at low level until note off)
      envGain.gain.linearRampToValueAtTime(0.2, decayEnd);

      // Hold at decay level until note off
      envGain.gain.setValueAtTime(0.2, releaseStart);

      // Quick release: 0.2 -> 0
      envGain.gain.linearRampToValueAtTime(0, releaseEnd);
    }

    // Connect FM routing based on algorithm
    this.connectAlgorithm(algorithm, tempOperators, tempGains, tempEnvGains, operatorParams, modGains);

    // Calculate stop time with fixed minimal release
    const fixedRelease = 0.05;
    const oscStopTime = currentTime + duration + fixedRelease;

    // Start all oscillators
    for (let i = 0; i < 4; i++) {
      tempOperators[i].start(currentTime);
      tempOperators[i].stop(oscStopTime);
    }

    // LFO
    if (lfoParams.depth > 0) {
      this.lfo = this.audioContext.createOscillator();
      this.lfo.frequency.value = lfoParams.frequency;

      this.lfoGain = this.audioContext.createGain();
      this.lfoGain.gain.value = lfoParams.depth * baseFrequency;

      this.lfo.connect(this.lfoGain);

      // Apply LFO to all operators
      this.operators.forEach(osc => {
        if (this.lfoGain) {
          this.lfoGain.connect(osc.frequency);
        }
      });

      this.lfo.start(currentTime);
      this.lfo.stop(oscStopTime);
    }

    // Cleanup after release time
    setTimeout(() => {
      this.cleanup();
    }, (duration + fixedRelease) * 1000 + 100);
  }

  private connectAlgorithm(
    algorithm: FMAlgorithm,
    operators: OscillatorNode[],
    gains: GainNode[],
    envGains: GainNode[],
    operatorParams: OperatorParams[],
    modGains: GainNode[]
  ) {
    switch (algorithm) {
      case 'serial':
        // 0->1->2->3->output (serial chain)
        for (let i = 0; i < 4; i++) {
          if (i < 3) {
            const modGain = this.audioContext.createGain();
            modGain.gain.value = operatorParams[i].level * (1000 - i * 200);
            gains[i].connect(modGain);
            modGain.connect(operators[i + 1].frequency);
            modGains.push(modGain);
          } else {
            gains[i].connect(this.masterGain);
          }
        }
        break;

      case 'parallel':
        // All operators go directly to output
        for (let i = 0; i < 4; i++) {
          gains[i].connect(this.masterGain);
        }
        break;

      case 'hybrid1':
        // 0->1, 2->3, both to output
        const modGain0 = this.audioContext.createGain();
        modGain0.gain.value = operatorParams[0].level * 1000;
        gains[0].connect(modGain0);
        modGain0.connect(operators[1].frequency);
        modGains.push(modGain0);

        const modGain2 = this.audioContext.createGain();
        modGain2.gain.value = operatorParams[2].level * 1000;
        gains[2].connect(modGain2);
        modGain2.connect(operators[3].frequency);
        modGains.push(modGain2);

        gains[1].connect(this.masterGain);
        gains[3].connect(this.masterGain);
        break;

      case 'hybrid2':
        // 0->1->2, 3 separate, both to output
        const modGain0h2 = this.audioContext.createGain();
        modGain0h2.gain.value = operatorParams[0].level * 1000;
        gains[0].connect(modGain0h2);
        modGain0h2.connect(operators[1].frequency);
        modGains.push(modGain0h2);

        const modGain1h2 = this.audioContext.createGain();
        modGain1h2.gain.value = operatorParams[1].level * 800;
        gains[1].connect(modGain1h2);
        modGain1h2.connect(operators[2].frequency);
        modGains.push(modGain1h2);

        gains[2].connect(this.masterGain);
        gains[3].connect(this.masterGain);
        break;
    }
  }

  private cleanup() {
    this.operators.forEach(osc => {
      try {
        osc.disconnect();
      } catch (e) {
        // Already disconnected
      }
    });

    this.gains.forEach(gain => gain.disconnect());
    this.envelopes.forEach(env => env.disconnect());
    this.feedbackNodes.forEach(fb => fb.disconnect());
    this.feedbackGains.forEach(fb => fb.disconnect());

    if (this.lfo) {
      this.lfo.disconnect();
      this.lfo = null;
    }

    if (this.lfoGain) {
      this.lfoGain.disconnect();
      this.lfoGain = null;
    }

    this.operators = [];
    this.gains = [];
    this.envelopes = [];
    this.feedbackNodes = [];
    this.feedbackGains = [];
  }

  disconnect() {
    this.cleanup();
    this.masterGain.disconnect();
  }
}
