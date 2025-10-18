import type { TrackData } from '../components/Sequencer';
import type { FMAlgorithm } from '../audio/types';

/**
 * URL State Serialization Format
 *
 * Design Goals:
 * - Compact representation for URL compatibility
 * - Encode all track data including steps, parameters, and operators
 * - Use base64url encoding for URL safety
 * - Version prefix for future compatibility
 *
 * Format Structure:
 * Version (1 char) + BPM (2 bytes) + StepCount (1 byte) + Shuffle (1 byte) + Tracks (4 tracks)
 *
 * Each Track:
 * - Steps (64 bits = 8 bytes for boolean array)
 * - Velocity map (64 * 4 bits = 32 bytes, normalized 0-15)
 * - Pitch map (64 * 4 bits = 32 bytes, normalized 0-15, representing 0.25-4.0)
 * - Track params: frequency (2 bytes), noteLength (1 byte), flags (1 byte)
 * - LFO: freq (1 byte), depth (1 byte)
 * - Pitch envelope: depth (1 byte)
 * - Algorithm (2 bits), operators (4 operators * 8 bytes = 32 bytes)
 * - Ducking params (2 bytes)
 *
 * Approximate size per track: 8 + 32 + 32 + 6 + 2 + 1 + 32 + 2 = 115 bytes
 * Total for 4 tracks: ~460 bytes + overhead = ~614 base64 chars (well under 2000 char URL limit)
 */

const VERSION = '1';

// Helper to encode steps (64 booleans) into 8 bytes
function encodeSteps(steps: boolean[]): Uint8Array {
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 64; i++) {
    if (steps[i]) {
      bytes[Math.floor(i / 8)] |= 1 << (i % 8);
    }
  }
  return bytes;
}

function decodeSteps(bytes: Uint8Array, offset: number): boolean[] {
  const steps = new Array(64).fill(false);
  for (let i = 0; i < 64; i++) {
    steps[i] = !!(bytes[offset + Math.floor(i / 8)] & (1 << (i % 8)));
  }
  return steps;
}

// Helper to encode 0-1 range into 4 bits (0-15)
function encodeNibbleArray(values: number[]): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(values.length / 2));
  for (let i = 0; i < values.length; i++) {
    const nibble = Math.round(Math.max(0, Math.min(1, values[i])) * 15);
    if (i % 2 === 0) {
      bytes[Math.floor(i / 2)] = nibble << 4;
    } else {
      bytes[Math.floor(i / 2)] |= nibble;
    }
  }
  return bytes;
}

function decodeNibbleArray(bytes: Uint8Array, offset: number, length: number): number[] {
  const values = new Array(length);
  for (let i = 0; i < length; i++) {
    const byte = bytes[offset + Math.floor(i / 2)];
    const nibble = i % 2 === 0 ? (byte >> 4) : (byte & 0x0f);
    values[i] = nibble / 15;
  }
  return values;
}

// Helper to encode pitch map (range 0.25-4.0) into 4 bits per value
function encodePitchMap(values: number[]): Uint8Array {
  const normalized = values.map(v => (Math.max(0.25, Math.min(4, v)) - 0.25) / 3.75);
  return encodeNibbleArray(normalized);
}

function decodePitchMap(bytes: Uint8Array, offset: number, length: number): number[] {
  const normalized = decodeNibbleArray(bytes, offset, length);
  return normalized.map(v => v * 3.75 + 0.25);
}

// Encode uint16
function encodeUint16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  bytes[0] = (value >> 8) & 0xff;
  bytes[1] = value & 0xff;
  return bytes;
}

function decodeUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

// Encode uint8
function encodeUint8(value: number): number {
  return Math.round(Math.max(0, Math.min(255, value)));
}

// Encode float to byte (0-1 range)
function encodeFloat01(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 255);
}

function decodeFloat01(byte: number): number {
  return byte / 255;
}

// Encode float with custom range
function encodeFloatRange(value: number, min: number, max: number): number {
  const normalized = (Math.max(min, Math.min(max, value)) - min) / (max - min);
  return Math.round(normalized * 255);
}

function decodeFloatRange(byte: number, min: number, max: number): number {
  return (byte / 255) * (max - min) + min;
}

// Encode algorithm (2 bits)
const ALGORITHMS: FMAlgorithm[] = ['serial', 'parallel', 'hybrid1', 'hybrid2'];

function encodeAlgorithm(algo: FMAlgorithm): number {
  return ALGORITHMS.indexOf(algo);
}

function decodeAlgorithm(value: number): FMAlgorithm {
  return ALGORITHMS[value] || 'serial';
}

// Encode single track
function encodeTrack(track: TrackData): Uint8Array {
  const parts: Uint8Array[] = [];

  // Steps (8 bytes)
  parts.push(encodeSteps(track.steps));

  // Velocity map (32 bytes)
  parts.push(encodeNibbleArray(track.velocityMap));

  // Pitch map (32 bytes)
  parts.push(encodePitchMap(track.pitchMap));

  // Frequency (2 bytes, 0-2000 Hz)
  parts.push(encodeUint16(Math.round(track.frequency * 10) % 65536));

  // Note length (1 byte, 0.1-8.0)
  parts.push(new Uint8Array([encodeFloatRange(track.noteLength, 0.1, 8)]));

  // Flags (1 byte): lfoEnabled, pitchEnabled, duckingEnabled, isMuted, pitchControlVisible, velocityControlVisible, operatorsExpanded, lfoExpanded
  const flags =
    (track.lfoEnabled ? 1 : 0) |
    (track.pitchEnabled ? 2 : 0) |
    (track.duckingEnabled ? 4 : 0) |
    (track.isMuted ? 8 : 0) |
    (track.pitchControlVisible ? 16 : 0) |
    (track.velocityControlVisible ? 32 : 0) |
    (track.operatorsExpanded ? 64 : 0) |
    (track.lfoExpanded ? 128 : 0);
  parts.push(new Uint8Array([flags]));

  // More flags (1 byte): pitchEnvExpanded
  const flags2 = (track.pitchEnvExpanded ? 1 : 0);
  parts.push(new Uint8Array([flags2]));

  // LFO (2 bytes): frequency (0-50 Hz), depth (0-4)
  parts.push(new Uint8Array([encodeFloatRange(track.lfo.frequency, 0, 50)]));
  parts.push(new Uint8Array([encodeFloatRange(track.lfo.depth, 0, 4)]));

  // Pitch envelope (3 bytes): attack, decay, depth
  parts.push(new Uint8Array([encodeFloatRange(track.pitchEnvelope.attack, 0, 0.1)]));
  parts.push(new Uint8Array([encodeFloatRange(track.pitchEnvelope.decay, 0, 1)]));
  parts.push(new Uint8Array([encodeFloatRange(track.pitchEnvelope.depth, 0, 2)]));

  // Algorithm (2 bits) + ducking params (6 bits for amount, 1 byte for release)
  const algoBits = encodeAlgorithm(track.algorithm);
  const duckingAmountBits = Math.round(track.duckingAmount * 63); // 6 bits
  parts.push(new Uint8Array([(algoBits << 6) | duckingAmountBits]));
  parts.push(new Uint8Array([encodeFloatRange(track.duckingRelease, 0.01, 1)]));

  // Operators (4 operators * 8 bytes = 32 bytes)
  for (const op of track.operators) {
    parts.push(encodeUint16(Math.round(op.ratio * 100))); // ratio: 0-10 -> 0-1000
    parts.push(new Uint8Array([encodeFloat01(op.level)])); // level: 0-1
    parts.push(new Uint8Array([encodeFloatRange(op.attack, 0, 0.1)])); // attack: 0-0.1
    parts.push(new Uint8Array([encodeFloatRange(op.decay, 0, 1)])); // decay: 0-1
    parts.push(new Uint8Array([encodeFloat01(op.sustain)])); // sustain: 0-1
    parts.push(new Uint8Array([encodeFloatRange(op.release, 0, 1)])); // release: 0-1
    parts.push(new Uint8Array([encodeFloat01(op.feedbackAmount)])); // feedback: 0-1
  }

  // Concatenate all parts
  const totalLength = parts.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

// Decode single track (returns partial track data without synth/gain nodes)
function decodeTrack(bytes: Uint8Array, offset: number, trackId: number): Partial<TrackData> {
  let pos = offset;

  // Steps (8 bytes)
  const steps = decodeSteps(bytes, pos);
  pos += 8;

  // Velocity map (32 bytes)
  const velocityMap = decodeNibbleArray(bytes, pos, 64);
  pos += 32;

  // Pitch map (32 bytes)
  const pitchMap = decodePitchMap(bytes, pos, 64);
  pos += 32;

  // Frequency (2 bytes)
  const frequency = decodeUint16(bytes, pos) / 10;
  pos += 2;

  // Note length (1 byte)
  const noteLength = decodeFloatRange(bytes[pos], 0.1, 8);
  pos += 1;

  // Flags (1 byte)
  const flags = bytes[pos];
  pos += 1;
  const lfoEnabled = !!(flags & 1);
  const pitchEnabled = !!(flags & 2);
  const duckingEnabled = !!(flags & 4);
  const isMuted = !!(flags & 8);
  const pitchControlVisible = !!(flags & 16);
  const velocityControlVisible = !!(flags & 32);
  const operatorsExpanded = !!(flags & 64);
  const lfoExpanded = !!(flags & 128);

  // More flags (1 byte)
  const flags2 = bytes[pos];
  pos += 1;
  const pitchEnvExpanded = !!(flags2 & 1);

  // LFO (2 bytes)
  const lfoFrequency = decodeFloatRange(bytes[pos], 0, 50);
  pos += 1;
  const lfoDepth = decodeFloatRange(bytes[pos], 0, 4);
  pos += 1;

  // Pitch envelope (3 bytes)
  const pitchEnvelopeAttack = decodeFloatRange(bytes[pos], 0, 0.1);
  pos += 1;
  const pitchEnvelopeDecay = decodeFloatRange(bytes[pos], 0, 1);
  pos += 1;
  const pitchEnvelopeDepth = decodeFloatRange(bytes[pos], 0, 2);
  pos += 1;

  // Algorithm + ducking amount (1 byte)
  const algoByte = bytes[pos];
  pos += 1;
  const algorithm = decodeAlgorithm(algoByte >> 6);
  const duckingAmount = (algoByte & 0x3f) / 63;

  // Ducking release (1 byte)
  const duckingRelease = decodeFloatRange(bytes[pos], 0.01, 1);
  pos += 1;

  // Operators (4 operators * 7 bytes = 28 bytes)
  const operators = [];
  for (let i = 0; i < 4; i++) {
    const ratio = decodeUint16(bytes, pos) / 100;
    pos += 2;
    const level = decodeFloat01(bytes[pos]);
    pos += 1;
    const attack = decodeFloatRange(bytes[pos], 0, 0.1);
    pos += 1;
    const decay = decodeFloatRange(bytes[pos], 0, 1);
    pos += 1;
    const sustain = decodeFloat01(bytes[pos]);
    pos += 1;
    const release = decodeFloatRange(bytes[pos], 0, 1);
    pos += 1;
    const feedbackAmount = decodeFloat01(bytes[pos]);
    pos += 1;

    operators.push({
      frequency: 440, // Will be computed from ratio
      ratio,
      level,
      attack,
      decay,
      sustain,
      release,
      feedbackAmount,
    });
  }

  return {
    id: trackId,
    steps,
    velocityMap,
    pitchMap,
    frequency,
    noteLength,
    lfoEnabled,
    pitchEnabled,
    duckingEnabled,
    isMuted,
    pitchControlVisible,
    velocityControlVisible,
    operatorsExpanded,
    lfoExpanded,
    pitchEnvExpanded,
    lfo: {
      frequency: lfoFrequency,
      depth: lfoDepth,
    },
    pitchEnvelope: {
      attack: pitchEnvelopeAttack,
      decay: pitchEnvelopeDecay,
      depth: pitchEnvelopeDepth,
    },
    algorithm,
    duckingAmount,
    duckingRelease,
    operators,
  };
}

// Serialize all state to URL-safe string
export function serializeState(tracks: TrackData[], bpm: number, stepCount: number, shuffle: number): string {
  const parts: Uint8Array[] = [];

  // Version (1 char, not in binary)
  // BPM (2 bytes, 20-300)
  parts.push(encodeUint16(Math.round(bpm)));

  // Step count (1 byte, 16/32/64)
  parts.push(new Uint8Array([stepCount]));

  // Shuffle (1 byte, 0-1)
  parts.push(new Uint8Array([encodeFloat01(shuffle)]));

  // Encode each track
  for (const track of tracks) {
    parts.push(encodeTrack(track));
  }

  // Concatenate all
  const totalLength = parts.reduce((sum, arr) => sum + arr.length, 0);
  const allBytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    allBytes.set(part, offset);
    offset += part.length;
  }

  // Convert to base64url
  const base64 = btoa(String.fromCharCode(...allBytes));
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return VERSION + base64url;
}

// Deserialize URL-safe string to state
export function deserializeState(encoded: string): {
  tracks: Partial<TrackData>[];
  bpm: number;
  stepCount: number;
  shuffle: number;
} | null {
  try {
    // Check version
    if (encoded[0] !== VERSION) {
      console.error('Unsupported version:', encoded[0]);
      return null;
    }

    // Convert base64url to base64
    let base64 = encoded.slice(1);
    base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }

    // Decode base64
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    let pos = 0;

    // BPM (2 bytes)
    const bpm = decodeUint16(bytes, pos);
    pos += 2;

    // Step count (1 byte)
    const stepCount = bytes[pos];
    pos += 1;

    // Shuffle (1 byte)
    const shuffle = decodeFloat01(bytes[pos]);
    pos += 1;

    // Decode tracks
    const tracks: Partial<TrackData>[] = [];
    for (let i = 0; i < 4; i++) {
      const track = decodeTrack(bytes, pos, i);
      tracks.push(track);
      // Calculate next position (track size is fixed)
      pos += 8 + 32 + 32 + 2 + 1 + 1 + 1 + 2 + 3 + 2 + 32; // 116 bytes per track
    }

    return { tracks, bpm, stepCount, shuffle };
  } catch (error) {
    console.error('Failed to deserialize state:', error);
    return null;
  }
}
