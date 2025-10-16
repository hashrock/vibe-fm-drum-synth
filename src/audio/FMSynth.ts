import type { OperatorParams, LFOParams } from './types';

export type { OperatorParams, LFOParams } from './types';

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
    lfoParams: LFOParams
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

      // ADSR Envelope
      const attack = params.attack;
      const decay = params.decay;
      const sustain = params.sustain;
      const release = params.release;

      // Ensure times are valid and non-negative
      const attackTime = Math.max(0, attack);
      const decayTime = Math.max(0, decay);
      const releaseTime = Math.max(0, Math.min(release, duration * 0.9)); // Release can't be longer than 90% of duration
      const sustainStart = attackTime + decayTime;
      const releaseStart = Math.max(sustainStart, duration - releaseTime);

      envGain.gain.setValueAtTime(0, currentTime);
      envGain.gain.linearRampToValueAtTime(1, currentTime + attackTime);
      envGain.gain.linearRampToValueAtTime(sustain, currentTime + sustainStart);
      envGain.gain.setValueAtTime(sustain, currentTime + releaseStart);
      envGain.gain.linearRampToValueAtTime(0, currentTime + duration);
    }

    // Now connect FM routing: 0->1->2->3->output
    for (let i = 0; i < 4; i++) {
      const params = operatorParams[i];

      if (i < 3) {
        // Operators 0, 1, 2 modulate the next operator
        const modGain = this.audioContext.createGain();
        modGain.gain.value = params.level * (1000 - i * 200); // 1000, 800, 600
        tempGains[i].connect(modGain);
        modGain.connect(tempOperators[i + 1].frequency);
        modGains.push(modGain);
      } else {
        // Operator 3 goes to output
        tempGains[i].connect(this.masterGain);
      }
    }

    // Start all oscillators
    for (let i = 0; i < 4; i++) {
      tempOperators[i].start(currentTime);
      tempOperators[i].stop(currentTime + duration);
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
      this.lfo.stop(currentTime + duration);
    }

    // Cleanup
    setTimeout(() => {
      this.cleanup();
    }, duration * 1000 + 100);
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
