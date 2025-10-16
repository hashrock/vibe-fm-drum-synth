export interface OperatorParams {
  frequency: number;
  ratio: number;
  level: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  feedbackAmount: number;
}

export interface LFOParams {
  frequency: number;
  depth: number;
}

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

    // Create 4 operators
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

      // FM routing: 0->1->2->3->output
      if (i === 0) {
        // Operator 0 modulates Operator 1
        if (i + 1 < 4) {
          const modGain = this.audioContext.createGain();
          modGain.gain.value = params.level * 1000;
          opGain.connect(modGain);
          modGain.connect(this.operators[i + 1]?.frequency || envGain);
        }
      } else if (i === 1) {
        // Operator 1 modulates Operator 2
        if (i + 1 < 4) {
          const modGain = this.audioContext.createGain();
          modGain.gain.value = params.level * 800;
          opGain.connect(modGain);
          modGain.connect(this.operators[i + 1]?.frequency || envGain);
        }
      } else if (i === 2) {
        // Operator 2 modulates Operator 3
        if (i + 1 < 4) {
          const modGain = this.audioContext.createGain();
          modGain.gain.value = params.level * 600;
          opGain.connect(modGain);
          modGain.connect(this.operators[i + 1]?.frequency || envGain);
        }
      } else {
        // Operator 3 goes to output
        opGain.connect(this.masterGain);
      }

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

      envGain.gain.setValueAtTime(0, currentTime);
      envGain.gain.linearRampToValueAtTime(1, currentTime + attack);
      envGain.gain.linearRampToValueAtTime(sustain, currentTime + attack + decay);
      envGain.gain.setValueAtTime(sustain, currentTime + duration - release);
      envGain.gain.linearRampToValueAtTime(0, currentTime + duration);

      osc.start(currentTime);
      osc.stop(currentTime + duration);
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
