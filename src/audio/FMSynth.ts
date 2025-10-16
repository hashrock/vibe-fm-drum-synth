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
  private compressor: DynamicsCompressorNode;
  private limiter: DynamicsCompressorNode;
  private isPlaying: boolean = false;
  private releaseScheduled: boolean = false;
  private currentParams: OperatorParams[] = [];
  private cleanupTimer: number | null = null;
  private autoStopTimer: number | null = null;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;

    // Master gain with lower volume to prevent clipping
    this.masterGain = audioContext.createGain();
    this.masterGain.gain.value = 0.15; // Reduced from 0.25

    // Compressor to control dynamics
    this.compressor = audioContext.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    // Limiter to prevent clipping
    this.limiter = audioContext.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.01;

    // Signal chain: masterGain -> compressor -> limiter -> destination
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.limiter);
    this.limiter.connect(audioContext.destination);
  }

  connectAnalyzer(analyzer: AnalyserNode) {
    // Connect compressor to analyzer for monitoring
    this.compressor.connect(analyzer);
  }

  connectSidechainGain(gain: GainNode) {
    // Disconnect limiter from destination
    this.limiter.disconnect(this.audioContext.destination);
    // Connect through ducking gain node: limiter -> gain -> destination
    this.limiter.connect(gain);
    gain.connect(this.audioContext.destination);
  }

  noteOff() {
    if (!this.isPlaying || this.releaseScheduled) return;

    this.releaseScheduled = true;
    const currentTime = this.audioContext.currentTime;

    // Trigger release phase for all operators
    this.currentParams.forEach((params, i) => {
      if (this.envelopes[i]) {
        const currentGain = this.envelopes[i].gain.value;
        this.envelopes[i].gain.cancelScheduledValues(currentTime);
        this.envelopes[i].gain.setValueAtTime(currentGain, currentTime);
        this.envelopes[i].gain.linearRampToValueAtTime(0, currentTime + params.release);
      }
    });

    // Stop oscillators and cleanup after release
    const maxRelease = Math.max(...this.currentParams.map(op => op.release));
    setTimeout(() => {
      this.cleanup();
      this.isPlaying = false;
      this.releaseScheduled = false;
    }, maxRelease * 1000 + 100);
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

    // Cancel any pending cleanup timers
    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.autoStopTimer !== null) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }

    // If already playing, immediately clean up old notes
    if (this.isPlaying) {
      this.cleanupImmediate();
    }

    this.isPlaying = true;
    this.releaseScheduled = false;
    this.currentParams = operatorParams;

    const tempOperators: OscillatorNode[] = [];
    const tempGains: GainNode[] = [];
    const tempEnvGains: GainNode[] = [];

    // Create all 4 operators first
    for (let i = 0; i < 4; i++) {
      const params = operatorParams[i];

      let sourceNode: AudioScheduledSourceNode;

      // OP1 can use noise, others use oscillator
      if (i === 0 && params.useNoise) {
        // Create noise using buffer source
        const bufferSize = this.audioContext.sampleRate * 2; // 2 seconds of noise
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let j = 0; j < bufferSize; j++) {
          data[j] = Math.random() * 2 - 1;
        }
        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        sourceNode = noise;
      } else {
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
        sourceNode = osc;
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
      sourceNode.connect(feedbackDelay);
      feedbackDelay.connect(feedbackGain);
      feedbackGain.connect(feedbackDelay);

      // Main signal path
      sourceNode.connect(envGain);
      feedbackDelay.connect(envGain);
      envGain.connect(opGain);

      tempOperators.push(sourceNode as OscillatorNode);
      tempGains.push(opGain);
      tempEnvGains.push(envGain);

      this.operators.push(sourceNode as OscillatorNode);
      this.gains.push(opGain);
      this.envelopes.push(envGain);
      this.feedbackNodes.push(feedbackDelay);
      this.feedbackGains.push(feedbackGain);

      // Full ADSR Envelope
      const attack = params.attack;
      const decay = params.decay;
      const sustain = params.sustain;
      const release = params.release;

      // Envelope times
      const attackTime = Math.max(0, attack);
      const decayTime = Math.max(0, decay);

      const attackEnd = currentTime + attackTime;
      const decayEnd = attackEnd + decayTime;
      const noteEnd = currentTime + duration;

      // Attack: 0 -> 1
      envGain.gain.setValueAtTime(0, currentTime);
      envGain.gain.linearRampToValueAtTime(1, attackEnd);

      // Decay: 1 -> sustain level
      envGain.gain.linearRampToValueAtTime(sustain, decayEnd);

      // Sustain: hold at sustain level until note off
      envGain.gain.setValueAtTime(sustain, noteEnd);

      // Release: sustain -> 0 (will be triggered by noteOff or auto-release)
      envGain.gain.linearRampToValueAtTime(0, noteEnd + release);
    }

    // Connect FM routing based on algorithm
    this.connectAlgorithm(algorithm, tempOperators, tempGains, tempEnvGains, operatorParams);

    // Calculate stop time with max release
    const maxRelease = Math.max(...operatorParams.map(op => op.release));
    const oscStopTime = currentTime + duration + maxRelease;

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

    // Auto cleanup after full duration (ADSR complete)
    this.autoStopTimer = window.setTimeout(() => {
      if (this.isPlaying && !this.releaseScheduled) {
        this.cleanup();
        this.isPlaying = false;
      }
    }, (duration + maxRelease) * 1000 + 100);
  }

  private connectAlgorithm(
    algorithm: FMAlgorithm,
    operators: OscillatorNode[],
    gains: GainNode[],
    _envGains: GainNode[],
    operatorParams: OperatorParams[]
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

      case 'hybrid1': {
        // 0->1, 2->3, both to output
        const modGain0 = this.audioContext.createGain();
        modGain0.gain.value = operatorParams[0].level * 1000;
        gains[0].connect(modGain0);
        modGain0.connect(operators[1].frequency);

        const modGain2 = this.audioContext.createGain();
        modGain2.gain.value = operatorParams[2].level * 1000;
        gains[2].connect(modGain2);
        modGain2.connect(operators[3].frequency);

        gains[1].connect(this.masterGain);
        gains[3].connect(this.masterGain);
        break;
      }

      case 'hybrid2': {
        // 0->1->2, 3 separate, both to output
        const modGain0h2 = this.audioContext.createGain();
        modGain0h2.gain.value = operatorParams[0].level * 1000;
        gains[0].connect(modGain0h2);
        modGain0h2.connect(operators[1].frequency);

        const modGain1h2 = this.audioContext.createGain();
        modGain1h2.gain.value = operatorParams[1].level * 800;
        gains[1].connect(modGain1h2);
        modGain1h2.connect(operators[2].frequency);

        gains[2].connect(this.masterGain);
        gains[3].connect(this.masterGain);
        break;
      }
    }
  }

  private cleanupImmediate() {
    // Immediate cleanup with quick fade (used when new note starts)
    const currentTime = this.audioContext.currentTime;
    const quickFadeTime = 0.001; // 1ms very quick fade

    // Fade out envelopes
    this.envelopes.forEach(env => {
      try {
        const currentGain = env.gain.value;
        env.gain.cancelScheduledValues(currentTime);
        env.gain.setValueAtTime(currentGain, currentTime);
        env.gain.linearRampToValueAtTime(0, currentTime + quickFadeTime);
      } catch (_e) {
        // Ignore if already disconnected
      }
    });

    // Stop and disconnect immediately (fade happens in audio thread)
    this.operators.forEach(osc => {
      try {
        osc.stop(currentTime + quickFadeTime + 0.001);
        osc.disconnect();
      } catch (_e) {
        // Already disconnected
      }
    });

    this.gains.forEach(gain => {
      try {
        gain.disconnect();
      } catch (_e) {
        // Ignore
      }
    });
    this.envelopes.forEach(env => {
      try {
        env.disconnect();
      } catch (_e) {
        // Ignore
      }
    });
    this.feedbackNodes.forEach(fb => {
      try {
        fb.disconnect();
      } catch (_e) {
        // Ignore
      }
    });
    this.feedbackGains.forEach(fb => {
      try {
        fb.disconnect();
      } catch (_e) {
        // Ignore
      }
    });

    if (this.lfo) {
      try {
        this.lfo.stop(currentTime + quickFadeTime + 0.001);
        this.lfo.disconnect();
      } catch (_e) {
        // Ignore
      }
      this.lfo = null;
    }

    if (this.lfoGain) {
      try {
        this.lfoGain.disconnect();
      } catch (_e) {
        // Ignore
      }
      this.lfoGain = null;
    }

    this.operators = [];
    this.gains = [];
    this.envelopes = [];
    this.feedbackNodes = [];
    this.feedbackGains = [];
  }

  private cleanup() {
    const currentTime = this.audioContext.currentTime;
    const fadeTime = 0.005; // 5ms quick fade to avoid clicks

    // Fade out envelopes before disconnecting
    this.envelopes.forEach(env => {
      try {
        env.gain.cancelScheduledValues(currentTime);
        env.gain.setValueAtTime(env.gain.value, currentTime);
        env.gain.linearRampToValueAtTime(0, currentTime + fadeTime);
      } catch (_e) {
        // Ignore if already disconnected
      }
    });

    // Schedule disconnection after fade
    this.cleanupTimer = window.setTimeout(() => {
      // Disconnect without additional fade
      this.operators.forEach(osc => {
        try {
          osc.stop();
          osc.disconnect();
        } catch (_e) {
          // Already disconnected
        }
      });

      this.gains.forEach(gain => {
        try {
          gain.disconnect();
        } catch (_e) {
          // Ignore
        }
      });
      this.envelopes.forEach(env => {
        try {
          env.disconnect();
        } catch (_e) {
          // Ignore
        }
      });
      this.feedbackNodes.forEach(fb => {
        try {
          fb.disconnect();
        } catch (_e) {
          // Ignore
        }
      });
      this.feedbackGains.forEach(fb => {
        try {
          fb.disconnect();
        } catch (_e) {
          // Ignore
        }
      });

      if (this.lfo) {
        try {
          this.lfo.stop();
          this.lfo.disconnect();
        } catch (_e) {
          // Ignore
        }
        this.lfo = null;
      }

      if (this.lfoGain) {
        try {
          this.lfoGain.disconnect();
        } catch (_e) {
          // Ignore
        }
        this.lfoGain = null;
      }

      this.operators = [];
      this.gains = [];
      this.envelopes = [];
      this.feedbackNodes = [];
      this.feedbackGains = [];

      this.cleanupTimer = null;
    }, fadeTime * 1000 + 5);
  }

  disconnect() {
    this.cleanup();
    this.masterGain.disconnect();
  }
}
