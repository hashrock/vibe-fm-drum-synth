import { useState, useEffect, useRef } from 'react';
import { FMSynth } from '../audio/FMSynth';
import type { OperatorParams, LFOParams, PitchEnvelopeParams, FMAlgorithm } from '../audio/types';

interface TrackData {
  id: number;
  name: string;
  steps: boolean[];
  frequency: number;
  operators: OperatorParams[];
  lfo: LFOParams;
  algorithm: FMAlgorithm;
  pitchEnvelope: PitchEnvelopeParams;
  pitchMap: number[];
  noteLength: number; // Length in steps (1.0 = one step)
  activeSynth: FMSynth | null;
}

export const Sequencer = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [stepCount, setStepCount] = useState(16);
  const [currentStep, setCurrentStep] = useState(0);
  const [tracks, setTracks] = useState<TrackData[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);
  const tracksRef = useRef<TrackData[]>([]);

  // Keep tracksRef in sync with tracks state
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  // Initialize audio context and tracks
  useEffect(() => {
    audioContextRef.current = new AudioContext();

    // Create one synth instance per track (reusable)
    const trackSynths: FMSynth[] = [];
    for (let i = 0; i < 4; i++) {
      trackSynths.push(new FMSynth(audioContextRef.current));
    }

    const defaultOperators: OperatorParams[] = [
      { frequency: 440, ratio: 1, level: 0.5, attack: 0.001, decay: 0.1, sustain: 0.3, release: 0.1, feedbackAmount: 0 },
      { frequency: 440, ratio: 2, level: 0.3, attack: 0.001, decay: 0.08, sustain: 0.2, release: 0.08, feedbackAmount: 0 },
      { frequency: 440, ratio: 4, level: 0.2, attack: 0.001, decay: 0.05, sustain: 0.1, release: 0.05, feedbackAmount: 0 },
      { frequency: 440, ratio: 8, level: 0.7, attack: 0.001, decay: 0.12, sustain: 0.4, release: 0.12, feedbackAmount: 0 },
    ];

    const initialTracks: TrackData[] = [
      {
        id: 0,
        name: 'Kick',
        steps: new Array(64).fill(false),
        frequency: 55,
        operators: [
          { frequency: 55, ratio: 1, level: 0.8, attack: 0.001, decay: 0.1, sustain: 0.0, release: 0.2, feedbackAmount: 0.3 },
          { frequency: 55, ratio: 0.5, level: 0.6, attack: 0.001, decay: 0.08, sustain: 0.0, release: 0.15, feedbackAmount: 0.2 },
          { frequency: 55, ratio: 0.25, level: 0.3, attack: 0.001, decay: 0.05, sustain: 0.0, release: 0.1, feedbackAmount: 0 },
          { frequency: 55, ratio: 0.1, level: 0.7, attack: 0.001, decay: 0.08, sustain: 0.0, release: 0.15, feedbackAmount: 0 },
        ],
        lfo: { frequency: 0, depth: 0 },
        algorithm: 'serial' as FMAlgorithm,
        pitchEnvelope: { attack: 0.01, decay: 0.05, depth: 0.5 },
        pitchMap: new Array(64).fill(1),
        noteLength: 1.0,
        activeSynth: trackSynths[0],
      },
      {
        id: 1,
        name: 'Snare',
        steps: new Array(64).fill(false),
        frequency: 200,
        operators: [
          { frequency: 200, ratio: 1.5, level: 0.7, attack: 0.001, decay: 0.08, sustain: 0.1, release: 0.15, feedbackAmount: 0.5 },
          { frequency: 200, ratio: 2.3, level: 0.5, attack: 0.001, decay: 0.06, sustain: 0.05, release: 0.12, feedbackAmount: 0.4 },
          { frequency: 200, ratio: 3.7, level: 0.3, attack: 0.001, decay: 0.04, sustain: 0.02, release: 0.08, feedbackAmount: 0.3 },
          { frequency: 200, ratio: 5.1, level: 0.8, attack: 0.001, decay: 0.08, sustain: 0.1, release: 0.15, feedbackAmount: 0.2 },
        ],
        lfo: { frequency: 10, depth: 0.05 },
        algorithm: 'serial' as FMAlgorithm,
        pitchEnvelope: { attack: 0.01, decay: 0.03, depth: 0.3 },
        pitchMap: new Array(64).fill(1),
        noteLength: 1.0,
        activeSynth: trackSynths[1],
      },
      {
        id: 2,
        name: 'HiHat',
        steps: new Array(64).fill(false),
        frequency: 800,
        operators: [
          { frequency: 800, ratio: 2.1, level: 0.4, attack: 0.001, decay: 0.02, sustain: 0.0, release: 0.05, feedbackAmount: 0.7 },
          { frequency: 800, ratio: 3.3, level: 0.3, attack: 0.001, decay: 0.015, sustain: 0.0, release: 0.04, feedbackAmount: 0.6 },
          { frequency: 800, ratio: 4.7, level: 0.2, attack: 0.001, decay: 0.01, sustain: 0.0, release: 0.03, feedbackAmount: 0.5 },
          { frequency: 800, ratio: 6.2, level: 0.7, attack: 0.001, decay: 0.02, sustain: 0.0, release: 0.05, feedbackAmount: 0.4 },
        ],
        lfo: { frequency: 20, depth: 0.1 },
        algorithm: 'parallel' as FMAlgorithm,
        pitchEnvelope: { attack: 0.005, decay: 0.02, depth: 0.2 },
        pitchMap: new Array(64).fill(1),
        noteLength: 0.5,
        activeSynth: trackSynths[2],
      },
      {
        id: 3,
        name: 'Tom',
        steps: new Array(64).fill(false),
        frequency: 110,
        operators: [
          { frequency: 110, ratio: 1.2, level: 0.7, attack: 0.001, decay: 0.15, sustain: 0.2, release: 0.2, feedbackAmount: 0.2 },
          { frequency: 110, ratio: 1.8, level: 0.5, attack: 0.001, decay: 0.12, sustain: 0.15, release: 0.15, feedbackAmount: 0.1 },
          { frequency: 110, ratio: 2.5, level: 0.3, attack: 0.001, decay: 0.1, sustain: 0.1, release: 0.1, feedbackAmount: 0.05 },
          { frequency: 110, ratio: 3.2, level: 0.8, attack: 0.001, decay: 0.15, sustain: 0.2, release: 0.2, feedbackAmount: 0 },
        ],
        lfo: { frequency: 5, depth: 0.03 },
        algorithm: 'hybrid1' as FMAlgorithm,
        pitchEnvelope: { attack: 0.02, decay: 0.1, depth: 0.4 },
        pitchMap: new Array(64).fill(1),
        noteLength: 2.0,
        activeSynth: trackSynths[3],
      },
    ];

    setTracks(initialTracks);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Playback engine
  useEffect(() => {
    if (isPlaying && audioContextRef.current) {
      const stepDuration = (60 / bpm / 4) * 1000; // milliseconds per step

      intervalRef.current = window.setInterval(() => {
        setCurrentStep(prev => {
          const currentStepToPlay = prev;

          // Trigger sounds for active steps using latest tracks from ref
          tracksRef.current.forEach(track => {
            if (track.steps[currentStepToPlay] && track.activeSynth) {
              const pitchMultiplier = track.pitchMap[currentStepToPlay] || 1;
              const adjustedFrequency = track.frequency * pitchMultiplier;

              // Use note length setting (in steps)
              const noteDuration = (stepDuration * track.noteLength) / 1000;

              // Reuse the same synth instance (monophonic)
              track.activeSynth.trigger(
                adjustedFrequency,
                noteDuration,
                track.operators,
                track.lfo,
                track.algorithm,
                track.pitchEnvelope
              );
            }
          });

          return (prev + 1) % stepCount;
        });
      }, stepDuration);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, bpm, stepCount]);

  const toggleStep = (trackId: number, stepIndex: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId
          ? { ...track, steps: track.steps.map((s, i) => (i === stepIndex ? !s : s)) }
          : track
      )
    );
  };

  const clearAll = () => {
    setTracks(prev =>
      prev.map(track => ({ ...track, steps: new Array(64).fill(false) }))
    );
  };

  const updateOperator = (
    trackId: number,
    opIndex: number,
    param: keyof OperatorParams,
    value: number
  ) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId
          ? {
              ...track,
              operators: track.operators.map((op, i) =>
                i === opIndex ? { ...op, [param]: value } : op
              ),
            }
          : track
      )
    );
  };

  const updateLFO = (trackId: number, param: keyof LFOParams, value: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId
          ? { ...track, lfo: { ...track.lfo, [param]: value } }
          : track
      )
    );
  };

  const updatePitchEnvelope = (trackId: number, param: keyof PitchEnvelopeParams, value: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId
          ? { ...track, pitchEnvelope: { ...track.pitchEnvelope, [param]: value } }
          : track
      )
    );
  };

  const updateAlgorithm = (trackId: number, algorithm: FMAlgorithm) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, algorithm } : track
      )
    );
  };

  const updatePitchMap = (trackId: number, stepIndex: number, pitchMultiplier: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId
          ? { ...track, pitchMap: track.pitchMap.map((p, i) => (i === stepIndex ? pitchMultiplier : p)) }
          : track
      )
    );
  };

  const updateNoteLength = (trackId: number, noteLength: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, noteLength } : track
      )
    );
  };

  const randomizeTrack = (trackId: number) => {
    setTracks(prev =>
      prev.map(track => {
        if (track.id !== trackId) return track;

        const randomOperators = track.operators.map(op => ({
          ...op,
          ratio: Math.random() * 15 + 0.1,
          level: Math.random() * 0.8 + 0.2,
          attack: 0.001, // Always fast attack
          decay: Math.random() * 0.3 + 0.05,
          sustain: Math.random() * 0.5,
          release: Math.random() * 0.3 + 0.05,
          feedbackAmount: Math.random() * 0.8,
        }));

        return {
          ...track,
          operators: randomOperators,
          lfo: {
            frequency: Math.random() * 40,
            depth: Math.random() * 0.3,
          },
          pitchEnvelope: {
            attack: Math.random() * 0.05,
            decay: Math.random() * 0.2 + 0.05,
            depth: Math.random() * 1.5,
          },
        };
      })
    );
  };

  const [dragStepInfo, setDragStepInfo] = useState<{ trackId: number; stepIndex: number } | null>(null);

  const handleStepMouseDown = (trackId: number, stepIndex: number, e: React.MouseEvent) => {
    if (e.button === 0) {
      toggleStep(trackId, stepIndex);
      setDragStepInfo({ trackId, stepIndex });
    }
  };

  const handleStepMouseMove = (trackId: number, stepIndex: number, e: React.MouseEvent) => {
    if (dragStepInfo && dragStepInfo.trackId === trackId && dragStepInfo.stepIndex === stepIndex && e.buttons === 1) {
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const height = rect.height;
      const pitchMultiplier = Math.max(0.5, Math.min(2, 2 - (y / height) * 1.5));
      updatePitchMap(trackId, stepIndex, pitchMultiplier);
    }
  };

  const handleMouseUp = () => {
    setDragStepInfo(null);
  };

  return (
    <div style={{ fontFamily: 'monospace', background: '#1a1a1a', color: '#00ff00', padding: '10px', fontSize: '12px' }} onMouseUp={handleMouseUp}>
      <h1 style={{ textAlign: 'center', textShadow: '0 0 10px #00ff00', fontSize: '20px', margin: '10px 0' }}>FM SYNTH</h1>

      {/* Global Controls */}
      <div style={{ background: '#2a2a2a', border: '1px solid #00ff00', padding: '8px', marginBottom: '10px', borderRadius: '3px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              background: '#00ff00',
              color: '#1a1a1a',
              border: 'none',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
          >
            {isPlaying ? 'STOP' : 'PLAY'}
          </button>

          <label style={{ fontSize: '11px' }}>
            BPM:
            <input
              type="number"
              value={bpm}
              onChange={e => setBpm(Number(e.target.value))}
              min={40}
              max={300}
              style={{
                marginLeft: '5px',
                width: '50px',
                background: '#1a1a1a',
                color: '#00ff00',
                border: '1px solid #00ff00',
                padding: '3px',
                fontSize: '11px',
              }}
            />
          </label>

          <label style={{ fontSize: '11px' }}>
            Steps:
            <select
              value={stepCount}
              onChange={e => setStepCount(Number(e.target.value))}
              style={{
                marginLeft: '5px',
                background: '#1a1a1a',
                color: '#00ff00',
                border: '1px solid #00ff00',
                padding: '3px',
                fontSize: '11px',
              }}
            >
              <option value={16}>16</option>
              <option value={32}>32</option>
              <option value={64}>64</option>
            </select>
          </label>

          <button
            onClick={clearAll}
            style={{
              background: '#ff0000',
              color: '#fff',
              border: 'none',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
          >
            CLEAR
          </button>
        </div>
      </div>

      {/* Tracks */}
      {tracks.map(track => (
        <div
          key={track.id}
          style={{
            background: '#2a2a2a',
            border: '1px solid #00ff00',
            padding: '8px',
            marginBottom: '10px',
            borderRadius: '3px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '13px' }}>{track.name}</h3>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button
                onClick={() => randomizeTrack(track.id)}
                style={{
                  background: '#ff8800',
                  color: '#1a1a1a',
                  border: 'none',
                  padding: '2px 8px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  borderRadius: '2px',
                }}
              >
                RAND
              </button>
              <select
                value={track.algorithm}
                onChange={e => updateAlgorithm(track.id, e.target.value as FMAlgorithm)}
                style={{
                  background: '#1a1a1a',
                  color: '#00ff00',
                  border: '1px solid #00ff00',
                  padding: '2px 5px',
                  fontSize: '10px',
                }}
              >
                <option value="serial">Serial</option>
                <option value="parallel">Parallel</option>
                <option value="hybrid1">Hybrid1</option>
                <option value="hybrid2">Hybrid2</option>
              </select>
            </div>
          </div>

          {/* Step Sequencer with Pitch Control */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(stepCount, 16)}, 1fr)`,
              gap: '3px',
              marginBottom: '8px',
            }}
          >
            {track.steps.slice(0, stepCount).map((active, i) => {
              const pitchMult = track.pitchMap[i] || 1;
              const heightPercent = Math.min(100, ((pitchMult - 0.5) / 1.5) * 100);

              return (
                <div
                  key={i}
                  onMouseDown={(e) => handleStepMouseDown(track.id, i, e)}
                  onMouseMove={(e) => handleStepMouseMove(track.id, i, e)}
                  style={{
                    position: 'relative',
                    aspectRatio: '1',
                    background: '#1a1a1a',
                    border: `1px solid ${i === currentStep && isPlaying ? '#ffffff' : '#00ff00'}`,
                    cursor: 'pointer',
                    borderRadius: '2px',
                    boxShadow: i === currentStep && isPlaying ? '0 0 8px #00ff00' : 'none',
                  }}
                >
                  {active && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: `${heightPercent}%`,
                        background: '#00ff00',
                        borderRadius: '1px',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Compact Operators */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px', marginBottom: '6px' }}>
            {track.operators.map((op, opIndex) => (
              <div
                key={opIndex}
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #00ff00',
                  padding: '4px',
                  borderRadius: '2px',
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '4px', textAlign: 'center', fontSize: '10px' }}>
                  OP{opIndex + 1}
                </div>

                {[
                  { key: 'ratio', label: 'rat', min: 0.1, max: 16 },
                  { key: 'level', label: 'lev', min: 0, max: 1 },
                  { key: 'attack', label: 'att', min: 0, max: 0.1 },
                  { key: 'decay', label: 'dec', min: 0, max: 1 },
                  { key: 'sustain', label: 'sus', min: 0, max: 1 },
                  { key: 'release', label: 'rel', min: 0, max: 1 },
                  { key: 'feedbackAmount', label: 'fb', min: 0, max: 1 }
                ].map(({ key, label, min, max }) => (
                  <div key={key} style={{ marginBottom: '2px', fontSize: '9px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{label}</span>
                      <span>{op[key as keyof OperatorParams].toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={0.01}
                      value={op[key as keyof OperatorParams]}
                      onChange={e =>
                        updateOperator(track.id, opIndex, key as keyof OperatorParams, Number(e.target.value))
                      }
                      style={{ width: '100%', height: '8px' }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Compact Global Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '5px', fontSize: '9px' }}>
            <div>
              <div>Note L: {track.noteLength.toFixed(1)}</div>
              <input
                type="range"
                min={0.1}
                max={8}
                step={0.1}
                value={track.noteLength}
                onChange={e => updateNoteLength(track.id, Number(e.target.value))}
                style={{ width: '100%', height: '8px' }}
              />
            </div>
            <div>
              <div>LFO F: {track.lfo.frequency.toFixed(1)}</div>
              <input
                type="range"
                min={0}
                max={50}
                step={0.1}
                value={track.lfo.frequency}
                onChange={e => updateLFO(track.id, 'frequency', Number(e.target.value))}
                style={{ width: '100%', height: '8px' }}
              />
            </div>
            <div>
              <div>LFO D: {track.lfo.depth.toFixed(2)}</div>
              <input
                type="range"
                min={0}
                max={4}
                step={0.01}
                value={track.lfo.depth}
                onChange={e => updateLFO(track.id, 'depth', Number(e.target.value))}
                style={{ width: '100%', height: '8px' }}
              />
            </div>
            <div>
              <div>P.Env: {track.pitchEnvelope.depth.toFixed(2)}</div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.01}
                value={track.pitchEnvelope.depth}
                onChange={e => updatePitchEnvelope(track.id, 'depth', Number(e.target.value))}
                style={{ width: '100%', height: '8px' }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
