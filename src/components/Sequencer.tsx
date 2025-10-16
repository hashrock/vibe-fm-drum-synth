import { useState, useEffect, useRef } from 'react';
import { FMSynth } from '../audio/FMSynth';
import type { OperatorParams, LFOParams } from '../audio/types';

interface TrackData {
  id: number;
  name: string;
  steps: boolean[];
  frequency: number;
  operators: OperatorParams[];
  lfo: LFOParams;
}

export const Sequencer = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [stepCount, setStepCount] = useState(16);
  const [currentStep, setCurrentStep] = useState(0);
  const [tracks, setTracks] = useState<TrackData[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Initialize audio context and tracks
  useEffect(() => {
    audioContextRef.current = new AudioContext();

    const defaultOperators: OperatorParams[] = [
      { frequency: 440, ratio: 1, level: 0.5, attack: 0.001, decay: 0.05, sustain: 0.3, release: 0.1, feedbackAmount: 0 },
      { frequency: 440, ratio: 2, level: 0.3, attack: 0.001, decay: 0.03, sustain: 0.2, release: 0.08, feedbackAmount: 0 },
      { frequency: 440, ratio: 4, level: 0.2, attack: 0.001, decay: 0.02, sustain: 0.1, release: 0.05, feedbackAmount: 0 },
      { frequency: 440, ratio: 8, level: 0.1, attack: 0.001, decay: 0.01, sustain: 0.05, release: 0.03, feedbackAmount: 0 },
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
          { frequency: 55, ratio: 0.1, level: 0.1, attack: 0.001, decay: 0.03, sustain: 0.0, release: 0.05, feedbackAmount: 0 },
        ],
        lfo: { frequency: 0, depth: 0 },
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
          { frequency: 200, ratio: 5.1, level: 0.2, attack: 0.001, decay: 0.03, sustain: 0.01, release: 0.05, feedbackAmount: 0.2 },
        ],
        lfo: { frequency: 10, depth: 0.05 },
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
          { frequency: 800, ratio: 6.2, level: 0.1, attack: 0.001, decay: 0.008, sustain: 0.0, release: 0.02, feedbackAmount: 0.4 },
        ],
        lfo: { frequency: 20, depth: 0.1 },
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
          { frequency: 110, ratio: 3.2, level: 0.2, attack: 0.001, decay: 0.08, sustain: 0.05, release: 0.08, feedbackAmount: 0 },
        ],
        lfo: { frequency: 5, depth: 0.03 },
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

          // Trigger sounds for active steps
          tracks.forEach(track => {
            if (track.steps[currentStepToPlay]) {
              const synth = new FMSynth(audioContextRef.current!);
              synth.trigger(track.frequency, stepDuration / 1000, track.operators, track.lfo);
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
  }, [isPlaying, bpm, stepCount, tracks]);

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

  return (
    <div style={{ fontFamily: 'monospace', background: '#1a1a1a', color: '#00ff00', padding: '20px' }}>
      <h1 style={{ textAlign: 'center', textShadow: '0 0 10px #00ff00' }}>FM SYNTH RHYTHM MACHINE</h1>

      {/* Global Controls */}
      <div style={{ background: '#2a2a2a', border: '2px solid #00ff00', padding: '15px', marginBottom: '20px', borderRadius: '5px' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              background: '#00ff00',
              color: '#1a1a1a',
              border: 'none',
              padding: '10px 20px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              borderRadius: '3px',
            }}
          >
            {isPlaying ? 'STOP' : 'PLAY'}
          </button>

          <label>
            BPM:
            <input
              type="number"
              value={bpm}
              onChange={e => setBpm(Number(e.target.value))}
              min={40}
              max={300}
              style={{
                marginLeft: '10px',
                width: '60px',
                background: '#1a1a1a',
                color: '#00ff00',
                border: '1px solid #00ff00',
                padding: '5px',
              }}
            />
          </label>

          <label>
            Steps:
            <select
              value={stepCount}
              onChange={e => setStepCount(Number(e.target.value))}
              style={{
                marginLeft: '10px',
                background: '#1a1a1a',
                color: '#00ff00',
                border: '1px solid #00ff00',
                padding: '5px',
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
              padding: '10px 20px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              borderRadius: '3px',
            }}
          >
            CLEAR ALL
          </button>
        </div>
      </div>

      {/* Tracks */}
      {tracks.map(track => (
        <div
          key={track.id}
          style={{
            background: '#2a2a2a',
            border: '2px solid #00ff00',
            padding: '15px',
            marginBottom: '20px',
            borderRadius: '5px',
          }}
        >
          <h3 style={{ marginBottom: '15px' }}>TRACK {track.id + 1}: {track.name}</h3>

          {/* Step Sequencer */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(stepCount, 16)}, 1fr)`,
              gap: '5px',
              marginBottom: '15px',
            }}
          >
            {track.steps.slice(0, stepCount).map((active, i) => (
              <div
                key={i}
                onClick={() => toggleStep(track.id, i)}
                style={{
                  aspectRatio: '1',
                  background: active ? '#00ff00' : '#1a1a1a',
                  border: `2px solid ${i === currentStep && isPlaying ? '#ffffff' : '#00ff00'}`,
                  cursor: 'pointer',
                  borderRadius: '3px',
                  boxShadow: i === currentStep && isPlaying ? '0 0 15px #00ff00' : 'none',
                }}
              />
            ))}
          </div>

          {/* Operators */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '10px' }}>
            {track.operators.map((op, opIndex) => (
              <div
                key={opIndex}
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #00ff00',
                  padding: '10px',
                  borderRadius: '3px',
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>
                  OP{opIndex + 1}
                </div>

                {['ratio', 'level', 'attack', 'decay', 'sustain', 'release', 'feedbackAmount'].map(param => (
                  <div key={param} style={{ marginBottom: '5px', fontSize: '11px' }}>
                    <label style={{ display: 'block', marginBottom: '2px' }}>
                      {param}: {op[param as keyof OperatorParams].toFixed(3)}
                    </label>
                    <input
                      type="range"
                      min={param === 'ratio' ? 0.1 : 0}
                      max={param === 'ratio' ? 16 : param.includes('feedback') ? 1 : param === 'level' ? 1 : 1}
                      step={0.01}
                      value={op[param as keyof OperatorParams]}
                      onChange={e =>
                        updateOperator(track.id, opIndex, param as keyof OperatorParams, Number(e.target.value))
                      }
                      style={{ width: '100%' }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* LFO Controls */}
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <label>
              LFO Freq: {track.lfo.frequency.toFixed(2)} Hz
              <input
                type="range"
                min={0}
                max={50}
                step={0.1}
                value={track.lfo.frequency}
                onChange={e => updateLFO(track.id, 'frequency', Number(e.target.value))}
                style={{ marginLeft: '10px', width: '150px' }}
              />
            </label>

            <label>
              LFO Depth: {track.lfo.depth.toFixed(2)}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={track.lfo.depth}
                onChange={e => updateLFO(track.id, 'depth', Number(e.target.value))}
                style={{ marginLeft: '10px', width: '150px' }}
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
};
