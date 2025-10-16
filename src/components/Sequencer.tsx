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
  isExpanded: boolean;
  lfoEnabled: boolean;
  pitchEnabled: boolean;
  pitchLocked: boolean; // Lock pitch map editing
  sidechainEnabled: boolean;
  sidechainGain: GainNode | null; // For tracks 2,3,4 to receive sidechain signal
  sidechainThreshold: number; // Sidechain compression threshold (0-1)
  sidechainRatio: number; // Sidechain compression ratio (1-20)
  sidechainAttack: number; // How fast compression starts (0-1, lower = faster)
  sidechainRelease: number; // How fast compression stops (0-1, lower = faster)
  sidechainMakeup: number; // Makeup gain after compression (0-2, 1 = no change)
}

export const Sequencer = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [stepCount, setStepCount] = useState(16);
  const [currentStep, setCurrentStep] = useState(0);
  const [tracks, setTracks] = useState<TrackData[]>([]);
  const [sidechainLevels, setSidechainLevels] = useState<{[key: number]: {rms: number, gainReduction: number}}>({});

  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);
  const tracksRef = useRef<TrackData[]>([]);
  const sidechainAnalyzerRef = useRef<AnalyserNode | null>(null);
  const sidechainDetectorRef = useRef<number | null>(null);

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

    // Set up sidechain analyzer on track 1
    sidechainAnalyzerRef.current = audioContextRef.current.createAnalyser();
    sidechainAnalyzerRef.current.fftSize = 256;
    // Connect track 1 synth to analyzer
    trackSynths[0].connectAnalyzer(sidechainAnalyzerRef.current);

    // Create sidechain gain nodes for tracks 2, 3, 4
    const sidechainGains: GainNode[] = [];
    for (let i = 0; i < 4; i++) {
      if (i > 0) {
        const gain = audioContextRef.current.createGain();
        gain.gain.value = 1; // No compression initially
        sidechainGains.push(gain);
        trackSynths[i].connectSidechainGain(gain);
      } else {
        sidechainGains.push(null as any);
      }
    }

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
        isExpanded: false,
        lfoEnabled: false,
        pitchEnabled: true,
        pitchLocked: false,
        sidechainEnabled: false,
        sidechainGain: sidechainGains[0],
        sidechainThreshold: 0.2,
        sidechainRatio: 4,
        sidechainAttack: 0.1,
        sidechainRelease: 0.3,
        sidechainMakeup: 1.0,
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
        isExpanded: false,
        lfoEnabled: true,
        pitchEnabled: true,
        pitchLocked: false,
        sidechainEnabled: false,
        sidechainGain: sidechainGains[1],
        sidechainThreshold: 0.2,
        sidechainRatio: 4,
        sidechainAttack: 0.1,
        sidechainRelease: 0.3,
        sidechainMakeup: 1.0,
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
        isExpanded: false,
        lfoEnabled: true,
        pitchEnabled: false,
        pitchLocked: false,
        sidechainEnabled: false,
        sidechainGain: sidechainGains[2],
        sidechainThreshold: 0.2,
        sidechainRatio: 4,
        sidechainAttack: 0.1,
        sidechainRelease: 0.3,
        sidechainMakeup: 1.0,
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
        isExpanded: false,
        lfoEnabled: true,
        pitchEnabled: true,
        pitchLocked: false,
        sidechainEnabled: false,
        sidechainGain: sidechainGains[3],
        sidechainThreshold: 0.2,
        sidechainRatio: 4,
        sidechainAttack: 0.1,
        sidechainRelease: 0.3,
        sidechainMakeup: 1.0,
      },
    ];

    setTracks(initialTracks);

    // Start sidechain detector loop
    const dataArray = new Uint8Array(sidechainAnalyzerRef.current.frequencyBinCount);
    const detectSidechain = () => {
      if (!sidechainAnalyzerRef.current) return;

      sidechainAnalyzerRef.current.getByteFrequencyData(dataArray);

      // Calculate RMS amplitude
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length) / 255; // Normalize to 0-1

      // Apply gain reduction to tracks with sidechain enabled
      const newLevels: {[key: number]: {rms: number, gainReduction: number}} = {};

      // Debug: log RMS every 100 frames
      if (Math.random() < 0.01 && rms > 0) {
        console.log('Sidechain RMS:', rms.toFixed(3));
      }

      tracksRef.current.forEach((track) => {
        if (track.sidechainEnabled && track.sidechainGain) {
          // Compression: reduce gain when track 1 is loud
          // Use track-specific threshold and ratio
          const thresholdLinear = track.sidechainThreshold;
          const ratio = track.sidechainRatio;
          const attack = track.sidechainAttack;
          const release = track.sidechainRelease;
          const makeup = track.sidechainMakeup;

          // Convert to dB for proper compression calculation
          // RMS is already normalized 0-1, convert to dB (with floor of -60dB)
          const inputDb = rms > 0.00001 ? 20 * Math.log10(rms) : -60;
          const thresholdDb = thresholdLinear > 0.00001 ? 20 * Math.log10(thresholdLinear) : -60;

          let outputDb = inputDb;

          // Apply compression if above threshold
          if (inputDb > thresholdDb) {
            // Gain reduction formula: (Input - Threshold) / Ratio + Threshold
            const overThresholdDb = inputDb - thresholdDb;
            const gainReductionDb = overThresholdDb - (overThresholdDb / ratio);
            outputDb = inputDb - gainReductionDb;
          }

          // Convert back to linear gain
          const targetGain = Math.pow(10, (outputDb - inputDb) / 20);

          // Apply makeup gain
          const targetGainWithMakeup = targetGain * makeup;

          // Smooth the gain change with attack/release (in linear domain)
          const currentGain = track.sidechainGain.gain.value;
          const isCompressing = targetGainWithMakeup < currentGain;
          // Attack/Release are 0-1, convert to smoothing factor (lower value = faster)
          const attackTime = attack * 0.9 + 0.05; // 0.05 to 0.95
          const releaseTime = release * 0.9 + 0.05;
          const smoothFactor = isCompressing ? attackTime : releaseTime;
          const smoothedGain = currentGain * smoothFactor + targetGainWithMakeup * (1 - smoothFactor);

          const finalGain = Math.max(0.01, Math.min(2, smoothedGain));
          track.sidechainGain.gain.value = finalGain;

          // Debug: log compression
          if (Math.random() < 0.01 && inputDb > thresholdDb) {
            console.log(`Track ${track.id} SC: Input=${inputDb.toFixed(1)}dB, Threshold=${thresholdDb.toFixed(1)}dB, Gain=${finalGain.toFixed(3)} (${(finalGain*100).toFixed(0)}%)`);
          }

          // Store level info for visualization
          newLevels[track.id] = {
            rms: rms,
            gainReduction: finalGain
          };
        } else if (track.sidechainGain) {
          // Reset gain when sidechain is disabled
          track.sidechainGain.gain.value = 1;
        }
      });

      // Update state for visualization (throttle to avoid too many updates)
      if (Math.random() < 0.1) { // Update ~10% of frames
        setSidechainLevels(newLevels);
      }

      sidechainDetectorRef.current = requestAnimationFrame(detectSidechain);
    };
    detectSidechain();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (sidechainDetectorRef.current) {
        cancelAnimationFrame(sidechainDetectorRef.current);
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
              const pitchMultiplier = track.pitchEnabled ? (track.pitchMap[currentStepToPlay] || 1) : 1;
              const adjustedFrequency = track.frequency * pitchMultiplier;

              // Use note length setting (in steps)
              const noteDuration = (stepDuration * track.noteLength) / 1000;

              // Apply LFO only if enabled
              const effectiveLfo = track.lfoEnabled ? track.lfo : { frequency: 0, depth: 0 };

              // Apply pitch envelope only if enabled
              const effectivePitchEnv = track.pitchEnabled ? track.pitchEnvelope : undefined;

              // Reuse the same synth instance (monophonic)
              track.activeSynth.trigger(
                adjustedFrequency,
                noteDuration,
                track.operators,
                effectiveLfo,
                track.algorithm,
                effectivePitchEnv
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

  const toggleExpanded = (trackId: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, isExpanded: !track.isExpanded } : track
      )
    );
  };

  const toggleLFO = (trackId: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, lfoEnabled: !track.lfoEnabled } : track
      )
    );
  };

  const togglePitch = (trackId: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, pitchEnabled: !track.pitchEnabled } : track
      )
    );
  };

  const toggleSidechain = (trackId: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, sidechainEnabled: !track.sidechainEnabled } : track
      )
    );
  };

  const togglePitchLock = (trackId: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, pitchLocked: !track.pitchLocked } : track
      )
    );
  };

  const updateSidechainThreshold = (trackId: number, threshold: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, sidechainThreshold: threshold } : track
      )
    );
  };

  const updateSidechainRatio = (trackId: number, ratio: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, sidechainRatio: ratio } : track
      )
    );
  };

  const updateSidechainAttack = (trackId: number, attack: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, sidechainAttack: attack } : track
      )
    );
  };

  const updateSidechainRelease = (trackId: number, release: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, sidechainRelease: release } : track
      )
    );
  };

  const updateSidechainMakeup = (trackId: number, makeup: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, sidechainMakeup: makeup } : track
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
    const track = tracks.find(t => t.id === trackId);
    if (!track || track.pitchLocked) return; // Don't allow pitch editing if locked

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
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', background: '#2a2a2a', color: '#e0e0e0', padding: '20px', fontSize: '14px', minHeight: '100vh' }} onMouseUp={handleMouseUp}>
      <h1 style={{ textAlign: 'center', fontSize: '28px', margin: '0 0 24px 0', fontWeight: '300', letterSpacing: '2px' }}>FM SYNTH</h1>

      {/* Global Controls */}
      <div style={{ background: '#3a3a3a', padding: '16px', marginBottom: '20px', borderRadius: '4px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              background: isPlaying ? '#e0e0e0' : '#4a4a4a',
              color: isPlaying ? '#2a2a2a' : '#e0e0e0',
              border: '1px solid #5a5a5a',
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              borderRadius: '4px',
              transition: 'all 0.2s',
            }}
          >
            {isPlaying ? 'STOP' : 'PLAY'}
          </button>

          <label style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>BPM</span>
            <input
              type="number"
              value={bpm}
              onChange={e => setBpm(Number(e.target.value))}
              min={40}
              max={300}
              style={{
                width: '60px',
                background: '#4a4a4a',
                color: '#e0e0e0',
                border: '1px solid #5a5a5a',
                padding: '6px 8px',
                fontSize: '14px',
                borderRadius: '4px',
              }}
            />
          </label>

          <label style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Steps</span>
            <select
              value={stepCount}
              onChange={e => setStepCount(Number(e.target.value))}
              style={{
                background: '#4a4a4a',
                color: '#e0e0e0',
                border: '1px solid #5a5a5a',
                padding: '6px 8px',
                fontSize: '14px',
                borderRadius: '4px',
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
              background: '#4a4a4a',
              color: '#e0e0e0',
              border: '1px solid #5a5a5a',
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              borderRadius: '4px',
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
            background: '#353535',
            padding: '16px',
            marginBottom: '16px',
            borderRadius: '4px',
          }}
        >
          {/* Track Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '500' }}>{track.name}</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => toggleExpanded(track.id)}
                style={{
                  background: '#4a4a4a',
                  color: '#e0e0e0',
                  border: '1px solid #5a5a5a',
                  padding: '6px 12px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                }}
              >
                {track.isExpanded ? '−' : '+'}
              </button>
              <button
                onClick={() => randomizeTrack(track.id)}
                style={{
                  background: '#4a4a4a',
                  color: '#e0e0e0',
                  border: '1px solid #5a5a5a',
                  padding: '6px 12px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                }}
              >
                RAND
              </button>
              <select
                value={track.algorithm}
                onChange={e => updateAlgorithm(track.id, e.target.value as FMAlgorithm)}
                style={{
                  background: '#4a4a4a',
                  color: '#e0e0e0',
                  border: '1px solid #5a5a5a',
                  padding: '6px 8px',
                  fontSize: '13px',
                  borderRadius: '4px',
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
              gap: '4px',
              marginBottom: '16px',
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
                    background: '#4a4a4a',
                    border: i === currentStep && isPlaying ? '2px solid #e0e0e0' : '1px solid #5a5a5a',
                    cursor: 'pointer',
                    borderRadius: '2px',
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
                        background: '#90caf9',
                        borderRadius: '1px',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Main Controls */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>Note Length</label>
              <input
                type="range"
                min={0.1}
                max={8}
                step={0.1}
                value={track.noteLength}
                onChange={e => updateNoteLength(track.id, Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{track.noteLength.toFixed(1)}</div>
            </div>

            <div>
              <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <input
                  type="checkbox"
                  checked={track.lfoEnabled}
                  onChange={() => toggleLFO(track.id)}
                  style={{ width: '16px', height: '16px' }}
                />
                LFO Freq
              </label>
              <input
                type="range"
                min={0}
                max={50}
                step={0.1}
                value={track.lfo.frequency}
                onChange={e => updateLFO(track.id, 'frequency', Number(e.target.value))}
                disabled={!track.lfoEnabled}
                style={{ width: '100%', opacity: track.lfoEnabled ? 1 : 0.5 }}
              />
              <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{track.lfo.frequency.toFixed(1)} Hz</div>
            </div>

            <div>
              <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>LFO Depth</label>
              <input
                type="range"
                min={0}
                max={4}
                step={0.01}
                value={track.lfo.depth}
                onChange={e => updateLFO(track.id, 'depth', Number(e.target.value))}
                disabled={!track.lfoEnabled}
                style={{ width: '100%', opacity: track.lfoEnabled ? 1 : 0.5 }}
              />
              <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{track.lfo.depth.toFixed(2)}</div>
            </div>

            <div>
              <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <input
                  type="checkbox"
                  checked={track.pitchEnabled}
                  onChange={() => togglePitch(track.id)}
                  style={{ width: '16px', height: '16px' }}
                />
                Pitch Env
              </label>
              <input
                type="range"
                min={0}
                max={2}
                step={0.01}
                value={track.pitchEnvelope.depth}
                onChange={e => updatePitchEnvelope(track.id, 'depth', Number(e.target.value))}
                disabled={!track.pitchEnabled}
                style={{ width: '100%', opacity: track.pitchEnabled ? 1 : 0.5 }}
              />
              <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{track.pitchEnvelope.depth.toFixed(2)}</div>
            </div>

            <div>
              <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <input
                  type="checkbox"
                  checked={track.pitchLocked}
                  onChange={() => togglePitchLock(track.id)}
                  style={{ width: '16px', height: '16px' }}
                />
                Lock Pitch
              </label>
              <div style={{ fontSize: '12px', color: '#999', marginTop: '2px', height: '48px', display: 'flex', alignItems: 'center' }}>
                {track.pitchLocked ? 'Locked' : 'Unlocked'}
              </div>
            </div>
          </div>

          {/* Sidechain - Only for tracks 2, 3, 4 */}
          {track.id >= 1 && track.sidechainEnabled && (
            <div style={{ marginTop: '12px', padding: '12px', background: '#3a3a3a', borderRadius: '4px' }}>
              {/* Visual Indicator */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Sidechain Input Level</span>
                  <span style={{ color: '#90caf9', fontWeight: '500' }}>
                    {sidechainLevels[track.id]
                      ? `${(sidechainLevels[track.id].rms * 100).toFixed(1)}% ${sidechainLevels[track.id].rms > track.sidechainThreshold ? '🔴' : '⚪'}`
                      : '0%'}
                  </span>
                </div>
                <div style={{ height: '8px', background: '#2a2a2a', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                  {/* RMS Level Bar */}
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${(sidechainLevels[track.id]?.rms || 0) * 100}%`,
                    background: sidechainLevels[track.id]?.rms > track.sidechainThreshold ? '#ff5252' : '#4caf50',
                    transition: 'width 0.05s linear'
                  }} />
                  {/* Threshold Marker */}
                  <div style={{
                    position: 'absolute',
                    left: `${track.sidechainThreshold * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: '#fff',
                    opacity: 0.8
                  }} />
                </div>
                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Threshold: {(track.sidechainThreshold * 100).toFixed(0)}%</span>
                  <span>Gain: {sidechainLevels[track.id] ? `${(sidechainLevels[track.id].gainReduction * 100).toFixed(0)}%` : '100%'}</span>
                </div>
              </div>

              {/* Parameters */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>SC Threshold</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={track.sidechainThreshold}
                  onChange={e => updateSidechainThreshold(track.id, Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{track.sidechainThreshold.toFixed(2)}</div>
              </div>

              <div>
                <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>SC Ratio</label>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={0.1}
                  value={track.sidechainRatio}
                  onChange={e => updateSidechainRatio(track.id, Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{track.sidechainRatio.toFixed(1)}:1</div>
              </div>

              <div>
                <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>SC Attack</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={track.sidechainAttack}
                  onChange={e => updateSidechainAttack(track.id, Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{track.sidechainAttack.toFixed(2)}</div>
              </div>

              <div>
                <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>SC Release</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={track.sidechainRelease}
                  onChange={e => updateSidechainRelease(track.id, Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{track.sidechainRelease.toFixed(2)}</div>
              </div>

              <div>
                <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>SC Makeup</label>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.01}
                  value={track.sidechainMakeup}
                  onChange={e => updateSidechainMakeup(track.id, Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{track.sidechainMakeup.toFixed(2)}x</div>
              </div>
              </div>
            </div>
          )}

          {/* Sidechain Toggle - Only for tracks 2, 3, 4 when disabled */}
          {track.id >= 1 && !track.sidechainEnabled && (
            <div style={{ marginTop: '12px', padding: '12px', background: '#3a3a3a', borderRadius: '4px' }}>
              <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={track.sidechainEnabled}
                  onChange={() => toggleSidechain(track.id)}
                  style={{ width: '16px', height: '16px' }}
                />
                Enable Sidechain from CH1
              </label>
            </div>
          )}

          {/* Sidechain Toggle (when enabled) */}
          {track.id >= 1 && track.sidechainEnabled && (
            <div style={{ marginTop: '12px', padding: '8px 12px', background: '#454545', borderRadius: '4px' }}>
              <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={track.sidechainEnabled}
                  onChange={() => toggleSidechain(track.id)}
                  style={{ width: '16px', height: '16px' }}
                />
                Sidechain Enabled
              </label>
            </div>
          )}

          {/* Operators - Collapsible */}
          {track.isExpanded && (
            <div style={{ background: '#3a3a3a', padding: '12px', borderRadius: '4px', marginTop: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>Operators</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                {track.operators.map((op, opIndex) => (
                  <div key={opIndex} style={{ background: '#454545', padding: '8px', borderRadius: '4px' }}>
                    <div style={{ fontWeight: '500', marginBottom: '8px', textAlign: 'center', fontSize: '13px' }}>
                      OP{opIndex + 1}
                    </div>
                    {[
                      { key: 'ratio', label: 'Ratio', min: 0.1, max: 16 },
                      { key: 'level', label: 'Level', min: 0, max: 1 },
                      { key: 'attack', label: 'Attack', min: 0, max: 0.1 },
                      { key: 'decay', label: 'Decay', min: 0, max: 1 },
                      { key: 'sustain', label: 'Sustain', min: 0, max: 1 },
                      { key: 'release', label: 'Release', min: 0, max: 1 },
                      { key: 'feedbackAmount', label: 'Feedback', min: 0, max: 1 }
                    ].map(({ key, label, min, max }) => (
                      <div key={key} style={{ marginBottom: '6px' }}>
                        <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span>{label}</span>
                          <span style={{ color: '#999' }}>{op[key as keyof OperatorParams].toFixed(2)}</span>
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
                          style={{ width: '100%' }}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
