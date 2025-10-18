import { describe, it, expect } from 'vitest';
import { serializeState, deserializeState } from './urlState';
import type { TrackData } from '../components/Sequencer';

// Create a minimal mock track for testing
function createMockTrack(id: number): TrackData {
  return {
    id,
    name: `Track ${id}`,
    steps: new Array(64).fill(false).map((_, i) => i % 4 === 0),
    frequency: 100 + id * 50,
    operators: [
      {
        frequency: 440,
        ratio: 1.0,
        level: 0.8,
        attack: 0.01,
        decay: 0.1,
        sustain: 0.5,
        release: 0.2,
        feedbackAmount: 0.1,
      },
      {
        frequency: 440,
        ratio: 2.0,
        level: 0.6,
        attack: 0.02,
        decay: 0.15,
        sustain: 0.4,
        release: 0.25,
        feedbackAmount: 0.05,
      },
      {
        frequency: 440,
        ratio: 3.0,
        level: 0.4,
        attack: 0.015,
        decay: 0.12,
        sustain: 0.3,
        release: 0.22,
        feedbackAmount: 0.02,
      },
      {
        frequency: 440,
        ratio: 0.5,
        level: 0.5,
        attack: 0.01,
        decay: 0.1,
        sustain: 0.6,
        release: 0.3,
        feedbackAmount: 0.0,
      },
    ],
    lfo: {
      frequency: 5.0 + id,
      depth: 1.0 + id * 0.5,
    },
    algorithm: ['serial', 'parallel', 'hybrid1', 'hybrid2'][id % 4] as any,
    pitchEnvelope: {
      attack: 0.01,
      decay: 0.5,
      depth: 0.5 + id * 0.2,
    },
    pitchMap: new Array(64).fill(1.0).map((_, i) => 1 + (i % 8) * 0.1),
    velocityMap: new Array(64).fill(1.0).map((_, i) => 0.5 + (i % 16) * 0.03),
    noteLength: 1.0 + id * 0.5,
    activeSynth: null,
    lfoEnabled: id % 2 === 0,
    pitchEnabled: id % 2 === 1,
    pitchControlVisible: id === 0,
    velocityControlVisible: id === 1,
    operatorsExpanded: id === 2,
    lfoExpanded: id === 0,
    pitchEnvExpanded: id === 1,
    duckingEnabled: id > 0,
    duckingGain: null,
    duckingAmount: 0.3 + id * 0.1,
    duckingRelease: 0.1 + id * 0.05,
    isMuted: id === 3,
  };
}

describe('URL State Serialization', () => {
  it('should serialize and deserialize basic state', () => {
    const tracks = [
      createMockTrack(0),
      createMockTrack(1),
      createMockTrack(2),
      createMockTrack(3),
    ];
    const bpm = 120;
    const stepCount = 16;
    const shuffle = 0.25;

    const encoded = serializeState(tracks, bpm, stepCount, shuffle);
    expect(encoded).toBeTypeOf('string');
    expect(encoded.length).toBeGreaterThan(0);
    expect(encoded[0]).toBe('1'); // Version

    const decoded = deserializeState(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.bpm).toBe(bpm);
    expect(decoded!.stepCount).toBe(stepCount);
    expect(decoded!.shuffle).toBeCloseTo(shuffle, 2);
    expect(decoded!.tracks).toHaveLength(4);
  });

  it('should preserve track steps', () => {
    const tracks = [createMockTrack(0), createMockTrack(1), createMockTrack(2), createMockTrack(3)];
    const encoded = serializeState(tracks, 120, 16, 0);
    const decoded = deserializeState(encoded);

    for (let i = 0; i < 4; i++) {
      expect(decoded!.tracks[i].steps).toEqual(tracks[i].steps);
    }
  });

  it('should preserve track parameters with reasonable precision', () => {
    const tracks = [createMockTrack(0), createMockTrack(1), createMockTrack(2), createMockTrack(3)];
    const encoded = serializeState(tracks, 140, 32, 0.5);
    const decoded = deserializeState(encoded);

    for (let i = 0; i < 4; i++) {
      const original = tracks[i];
      const restored = decoded!.tracks[i];

      // Frequency should be within 0.1 Hz
      expect(restored.frequency).toBeCloseTo(original.frequency, 0);

      // Note length should be close
      expect(restored.noteLength).toBeCloseTo(original.noteLength, 1);

      // Boolean flags should match
      expect(restored.lfoEnabled).toBe(original.lfoEnabled);
      expect(restored.pitchEnabled).toBe(original.pitchEnabled);
      expect(restored.duckingEnabled).toBe(original.duckingEnabled);
      expect(restored.isMuted).toBe(original.isMuted);

      // Algorithm should match
      expect(restored.algorithm).toBe(original.algorithm);
    }
  });

  it('should preserve velocity and pitch maps', () => {
    const tracks = [createMockTrack(0), createMockTrack(1), createMockTrack(2), createMockTrack(3)];
    const encoded = serializeState(tracks, 120, 16, 0);
    const decoded = deserializeState(encoded);

    for (let i = 0; i < 4; i++) {
      const original = tracks[i];
      const restored = decoded!.tracks[i];

      // Velocity map (4-bit precision = 1/15 = ~0.067 resolution)
      expect(restored.velocityMap).toBeDefined();
      for (let j = 0; j < 64; j++) {
        expect(Math.abs(restored.velocityMap![j] - original.velocityMap[j])).toBeLessThan(0.1);
      }

      // Pitch map (4-bit precision, range 0.25-4.0)
      expect(restored.pitchMap).toBeDefined();
      for (let j = 0; j < 64; j++) {
        expect(Math.abs(restored.pitchMap![j] - original.pitchMap[j])).toBeLessThan(0.3);
      }
    }
  });

  it('should preserve operator parameters', () => {
    const tracks = [createMockTrack(0), createMockTrack(1), createMockTrack(2), createMockTrack(3)];
    const encoded = serializeState(tracks, 120, 16, 0);
    const decoded = deserializeState(encoded);

    for (let i = 0; i < 4; i++) {
      const original = tracks[i];
      const restored = decoded!.tracks[i];

      for (let j = 0; j < 4; j++) {
        const origOp = original.operators[j];
        const restOp = restored.operators![j];

        expect(restOp.ratio).toBeCloseTo(origOp.ratio, 1);
        expect(restOp.level).toBeCloseTo(origOp.level, 2);
        expect(restOp.attack).toBeCloseTo(origOp.attack, 3);
        expect(restOp.decay).toBeCloseTo(origOp.decay, 2);
        expect(restOp.sustain).toBeCloseTo(origOp.sustain, 2);
        expect(restOp.release).toBeCloseTo(origOp.release, 2);
        expect(restOp.feedbackAmount).toBeCloseTo(origOp.feedbackAmount, 2);
      }
    }
  });

  it('should preserve LFO and pitch envelope settings', () => {
    const tracks = [createMockTrack(0), createMockTrack(1), createMockTrack(2), createMockTrack(3)];
    const encoded = serializeState(tracks, 120, 16, 0);
    const decoded = deserializeState(encoded);

    for (let i = 0; i < 4; i++) {
      const original = tracks[i];
      const restored = decoded!.tracks[i];

      // LFO frequency (0-50 Hz, 8-bit = ~0.2 Hz resolution)
      expect(Math.abs(restored.lfo!.frequency - original.lfo.frequency)).toBeLessThan(0.25);
      // LFO depth (0-4, 8-bit = ~0.016 resolution)
      expect(restored.lfo!.depth).toBeCloseTo(original.lfo.depth, 1);
      // Pitch envelope depth (0-2, 8-bit = ~0.008 resolution)
      expect(restored.pitchEnvelope!.depth).toBeCloseTo(original.pitchEnvelope.depth, 1);
    }
  });

  it('should preserve UI state flags', () => {
    const tracks = [createMockTrack(0), createMockTrack(1), createMockTrack(2), createMockTrack(3)];
    const encoded = serializeState(tracks, 120, 16, 0);
    const decoded = deserializeState(encoded);

    for (let i = 0; i < 4; i++) {
      const original = tracks[i];
      const restored = decoded!.tracks[i];

      expect(restored.pitchControlVisible).toBe(original.pitchControlVisible);
      expect(restored.velocityControlVisible).toBe(original.velocityControlVisible);
      expect(restored.operatorsExpanded).toBe(original.operatorsExpanded);
      expect(restored.lfoExpanded).toBe(original.lfoExpanded);
      expect(restored.pitchEnvExpanded).toBe(original.pitchEnvExpanded);
    }
  });

  it('should preserve ducking parameters', () => {
    const tracks = [createMockTrack(0), createMockTrack(1), createMockTrack(2), createMockTrack(3)];
    const encoded = serializeState(tracks, 120, 16, 0);
    const decoded = deserializeState(encoded);

    for (let i = 0; i < 4; i++) {
      const original = tracks[i];
      const restored = decoded!.tracks[i];

      // Ducking amount (6-bit precision = 1/63 = ~0.016 resolution)
      expect(restored.duckingAmount).toBeDefined();
      expect(Math.abs(restored.duckingAmount! - original.duckingAmount)).toBeLessThan(0.02);
      // Ducking release (8-bit, 0.01-1.0 range = ~0.004 resolution)
      expect(restored.duckingRelease).toBeDefined();
      expect(restored.duckingRelease).toBeCloseTo(original.duckingRelease, 2);
    }
  });

  it('should handle different BPM values', () => {
    const tracks = [createMockTrack(0), createMockTrack(1), createMockTrack(2), createMockTrack(3)];

    const testBpms = [60, 120, 180, 240];
    for (const bpm of testBpms) {
      const encoded = serializeState(tracks, bpm, 16, 0);
      const decoded = deserializeState(encoded);
      expect(decoded!.bpm).toBe(bpm);
    }
  });

  it('should handle different step counts', () => {
    const tracks = [createMockTrack(0), createMockTrack(1), createMockTrack(2), createMockTrack(3)];

    const testStepCounts = [16, 32, 64];
    for (const stepCount of testStepCounts) {
      const encoded = serializeState(tracks, 120, stepCount, 0);
      const decoded = deserializeState(encoded);
      expect(decoded!.stepCount).toBe(stepCount);
    }
  });

  it('should handle shuffle values', () => {
    const tracks = [createMockTrack(0), createMockTrack(1), createMockTrack(2), createMockTrack(3)];

    const testShuffles = [0, 0.25, 0.5, 0.75, 1.0];
    for (const shuffle of testShuffles) {
      const encoded = serializeState(tracks, 120, 16, shuffle);
      const decoded = deserializeState(encoded);
      expect(decoded!.shuffle).toBeCloseTo(shuffle, 2);
    }
  });

  it('should produce URL-safe strings', () => {
    const tracks = [createMockTrack(0), createMockTrack(1), createMockTrack(2), createMockTrack(3)];
    const encoded = serializeState(tracks, 120, 16, 0.5);

    // Should not contain characters that need URL encoding
    expect(encoded).not.toMatch(/[+/=]/);
    // Should only contain URL-safe characters
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('should handle invalid input gracefully', () => {
    expect(deserializeState('')).toBeNull();
    expect(deserializeState('invalid')).toBeNull();
    expect(deserializeState('2validbutversion2')).toBeNull();
  });

  it('should be reasonably compact', () => {
    const tracks = [createMockTrack(0), createMockTrack(1), createMockTrack(2), createMockTrack(3)];
    const encoded = serializeState(tracks, 120, 16, 0.5);

    // Should be under 800 characters for 4 full tracks
    expect(encoded.length).toBeLessThan(800);
    console.log('Encoded state length:', encoded.length, 'characters');
  });
});
