export interface OperatorParams {
  frequency: number;
  ratio: number;
  level: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  feedbackAmount: number;
  useNoise?: boolean; // OP1 can use noise instead of oscillator
}

export interface LFOParams {
  frequency: number;
  depth: number;
}

export interface PitchEnvelopeParams {
  attack: number;
  decay: number;
  depth: number;
}

export type FMAlgorithm = 'serial' | 'parallel' | 'hybrid1' | 'hybrid2';
