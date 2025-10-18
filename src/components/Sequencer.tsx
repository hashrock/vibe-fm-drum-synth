import { useState, useEffect, useRef } from 'react';
import { FMSynth } from '../audio/FMSynth';
import type { OperatorParams, LFOParams, PitchEnvelopeParams, FMAlgorithm } from '../audio/types';
import { ADSRGraph } from './ADSRGraph';
import { RectSlider } from './RectSlider';
import { RotaryKnob } from './RotaryKnob';
import { FMAlgorithmDiagram } from './FMAlgorithmDiagram';
import { LFOGraph } from './LFOGraph';
import { PitchEnvelopeGraph } from './PitchEnvelopeGraph';
import {
  FaPlay,
  FaPause,
  FaRandom,
  FaCopy,
  FaPaste,
  FaTrash,
  FaUndo,
  FaVolumeMute,
  FaVolumeUp,
  FaChevronDown,
  FaChevronUp
} from 'react-icons/fa';

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
  velocityMap: number[]; // Velocity per step (0.0 - 1.0)
  noteLength: number; // Length in steps (1.0 = one step)
  activeSynth: FMSynth | null;
  lfoEnabled: boolean;
  pitchEnabled: boolean;
  pitchControlVisible: boolean; // Toggle pitch control UI
  velocityControlVisible: boolean; // Toggle velocity control UI
  operatorsExpanded: boolean; // Toggle operators section visibility
  lfoExpanded: boolean; // Toggle LFO section visibility
  pitchEnvExpanded: boolean; // Toggle pitch envelope section visibility
  duckingEnabled: boolean;
  duckingGain: GainNode | null; // For tracks 2,3,4 to receive ducking signal
  duckingAmount: number; // How much to reduce volume (0-1, 0 = mute, 1 = no change)
  duckingRelease: number; // How fast to return to normal (seconds)
  isMuted: boolean; // Mute channel
}

export const Sequencer = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [stepCount, setStepCount] = useState(16);
  const [currentStep, setCurrentStep] = useState(0);
  const [tracks, setTracks] = useState<TrackData[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [hoveredOperator, setHoveredOperator] = useState<{ trackId: number; operatorIndex: number | 'all' | null } | null>(null);
  const [shuffle, setShuffle] = useState(0.0); // Global shuffle parameter

  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);
  const currentStepRef = useRef(0);
  const tracksRef = useRef<TrackData[]>([]);

  // Keep tracksRef in sync with tracks state
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  // Toast auto-hide
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Auto-save to localStorage
  useEffect(() => {
    if (tracks.length > 0) {
      try {
        const tracksToSave = tracks.map(track => ({
          ...track,
          activeSynth: null,
          duckingGain: null,
        }));
        localStorage.setItem('fmsynth-tracks', JSON.stringify(tracksToSave));
      } catch (e) {
        console.error('Failed to save tracks:', e);
      }
    }
  }, [tracks]);

  const showToast = (message: string) => {
    setToast(message);
  };

  // Initialize audio context and tracks
  useEffect(() => {
    audioContextRef.current = new AudioContext();

    // Create one synth instance per track (reusable)
    const trackSynths: FMSynth[] = [];
    for (let i = 0; i < 4; i++) {
      trackSynths.push(new FMSynth(audioContextRef.current));
    }

    // Create ducking gain nodes for tracks 2, 3, 4
    const duckingGains: GainNode[] = [];
    for (let i = 0; i < 4; i++) {
      if (i > 0) {
        const gain = audioContextRef.current.createGain();
        gain.gain.value = 1; // No ducking initially
        duckingGains.push(gain);
        trackSynths[i].connectSidechainGain(gain);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        duckingGains.push(null as any);
      }
    }

    const initialTracks: TrackData[] = [
      {
        id: 0,
        name: 'Kick',
        steps: new Array(64).fill(false).map((_, i) => i % 4 === 0 && i < 16),
        frequency: 55,
        operators: [
          { frequency: 55, ratio: 1.57, level: 0.30846065929062844, attack: 0.001, decay: 0.2924691461314984, sustain: 0.3052622340820058, release: 0.23572082996985017, feedbackAmount: 0.5519581506267578 },
          { frequency: 55, ratio: 1.48, level: 0.5927759298844391, attack: 0.001, decay: 0.09971183734862396, sustain: 0.15405327669189317, release: 0.33589217394922644, feedbackAmount: 0.7894718414985458 },
          { frequency: 55, ratio: 2.33, level: 0.30651959266073736, attack: 0.001, decay: 0.17247350678078033, sustain: 0.010876614372196836, release: 0.2998970050614464, feedbackAmount: 0.31942793972654543 },
          { frequency: 55, ratio: 1.88, level: 0.47632812369723265, attack: 0.001, decay: 0.15675361302425694, sustain: 0.33193765080781823, release: 0.08266122022775887, feedbackAmount: 0.2678397087736604 },
        ],
        lfo: { frequency: 7.289716616269852, depth: 0.2644860006832155 },
        algorithm: 'parallel' as FMAlgorithm,
        pitchEnvelope: { attack: 0.03263920787813766, decay: 0.0633337102583343, depth: 2 },
        pitchMap: new Array(64).fill(1),
        velocityMap: new Array(64).fill(1),
        noteLength: 1.0,
        activeSynth: trackSynths[0],
        lfoEnabled: true,
        pitchEnabled: true,
        pitchControlVisible: false,
        velocityControlVisible: false,
        operatorsExpanded: false,
        lfoExpanded: false,
        pitchEnvExpanded: false,
        duckingEnabled: false,
        duckingGain: duckingGains[0],
        duckingAmount: 0.3, // Duck to 30%
        duckingRelease: 0.2, // 200ms release
        isMuted: false,
      },
      {
        id: 1,
        name: 'Snare',
        steps: new Array(64).fill(false).map((_, i) => (i === 4 || i === 12) && i < 16),
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
        velocityMap: new Array(64).fill(1),
        noteLength: 1.0,
        activeSynth: trackSynths[1],
        lfoEnabled: true,
        pitchEnabled: true,
        pitchControlVisible: false,
        velocityControlVisible: false,
        operatorsExpanded: false,
        lfoExpanded: false,
        pitchEnvExpanded: false,
        duckingEnabled: false,
        duckingGain: duckingGains[1],
        duckingAmount: 0.3,
        duckingRelease: 0.2,
        isMuted: false,
      },
      {
        id: 2,
        name: 'HiHat',
        steps: new Array(64).fill(false).map((_, i) => i % 2 === 0 && i < 16),
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
        velocityMap: new Array(64).fill(1),
        noteLength: 0.5,
        activeSynth: trackSynths[2],
        lfoEnabled: true,
        pitchEnabled: false,
        pitchControlVisible: false,
        velocityControlVisible: false,
        operatorsExpanded: false,
        lfoExpanded: false,
        pitchEnvExpanded: false,
        duckingEnabled: false,
        duckingGain: duckingGains[2],
        duckingAmount: 0.3,
        duckingRelease: 0.2,
        isMuted: false,
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
        velocityMap: new Array(64).fill(1),
        noteLength: 2.0,
        activeSynth: trackSynths[3],
        lfoEnabled: true,
        pitchEnabled: true,
        pitchControlVisible: false,
        velocityControlVisible: false,
        operatorsExpanded: false,
        lfoExpanded: false,
        pitchEnvExpanded: false,
        duckingEnabled: false,
        duckingGain: duckingGains[3],
        duckingAmount: 0.3,
        duckingRelease: 0.2,
        isMuted: false,
      },
    ];

    // Load from localStorage or use initial tracks
    try {
      const savedData = localStorage.getItem('fmsynth-tracks');
      if (savedData) {
        const parsed = JSON.parse(savedData);
        const restoredTracks = parsed.map((track: TrackData, index: number) => ({
          ...track,
          // Add missing fields if they don't exist (for backward compatibility)
          velocityMap: track.velocityMap || new Array(64).fill(1),
          pitchControlVisible: track.pitchControlVisible ?? false,
          velocityControlVisible: track.velocityControlVisible ?? false,
          operatorsExpanded: track.operatorsExpanded ?? false,
          lfoExpanded: track.lfoExpanded ?? false,
          pitchEnvExpanded: track.pitchEnvExpanded ?? false,
          activeSynth: trackSynths[index],
          duckingGain: index > 0 ? duckingGains[index] : null,
        }));
        setTracks(restoredTracks);
      } else {
        setTracks(initialTracks);
      }
    } catch (e) {
      console.error('Failed to load saved tracks:', e);
      setTracks(initialTracks);
    }

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Spacebar to toggle play/stop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if not focused on an input element
      if (e.code === 'Space' && e.target instanceof HTMLElement &&
          e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' &&
          e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Ducking helper function
  const triggerDucking = () => {
    const currentTime = audioContextRef.current?.currentTime || 0;

    tracksRef.current.forEach((track) => {
      if (track.duckingEnabled && track.duckingGain) {
        const releaseTime = track.duckingRelease;
        const duckAmount = track.duckingAmount;

        // Instant duck down
        track.duckingGain.gain.cancelScheduledValues(currentTime);
        track.duckingGain.gain.setValueAtTime(track.duckingGain.gain.value, currentTime);
        track.duckingGain.gain.linearRampToValueAtTime(duckAmount, currentTime + 0.001);

        // Release back to 1.0
        track.duckingGain.gain.linearRampToValueAtTime(1.0, currentTime + 0.001 + releaseTime);
      }
    });
  };

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  // Playback engine with shuffle support
  useEffect(() => {
    let cancelled = false;

    if (isPlaying && audioContextRef.current) {
      const baseDuration = (60 / bpm / 4) * 1000; // milliseconds per step

      const scheduleNextStep = (step: number) => {
        if (cancelled) {
          return;
        }

        currentStepRef.current = step;

        // Trigger sounds for active steps
        tracksRef.current.forEach(track => {
          if (track.steps[step] && track.activeSynth && !track.isMuted) {
            const pitchMultiplier = track.pitchEnabled ? (track.pitchMap[step] || 1) : 1;
            const adjustedFrequency = track.frequency * pitchMultiplier;

            // Get velocity for this step
            const velocity = track.velocityMap[step] || 1;

            // Use note length setting (in steps)
            const noteDuration = (baseDuration * track.noteLength) / 1000;

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
              effectivePitchEnv,
              velocity
            );

            // Trigger ducking when CH1 (Kick) plays
            if (track.id === 0) {
              triggerDucking();
            }
          }
        });

        // Update visual step indicator
        setCurrentStep(step);

        // Calculate next step delay with shuffle
        const nextStep = (step + 1) % stepCount;
        let delay = baseDuration;

        // Apply shuffle: every odd 16th note (1, 3, 5, 7, etc.) gets delayed
        // Shuffle value 0-1: 0 = no swing, 1 = max swing (triplet feel)
        if (step % 2 === 0 && shuffle > 0) {
          // Current step is even (0, 2, 4...), next will be odd - add swing delay
          delay = baseDuration * (1 + shuffle * 0.5); // Up to 1.5x duration for full shuffle
        } else if (step % 2 === 1 && shuffle > 0) {
          // Current step is odd (1, 3, 5...), next will be even - subtract to compensate
          delay = baseDuration * (1 - shuffle * 0.5); // Down to 0.5x duration
        }

        // Schedule next step
        intervalRef.current = window.setTimeout(() => {
          if (!cancelled) {
            scheduleNextStep(nextStep);
          }
        }, delay);
      };

      // Start playback
      const startStep = currentStepRef.current % stepCount;
      scheduleNextStep(startStep < 0 ? (startStep + stepCount) % stepCount : startStep);
    } else {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
      currentStepRef.current = currentStepRef.current % Math.max(stepCount, 1);
    }

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
      currentStepRef.current = currentStepRef.current % Math.max(stepCount, 1);
    };
  }, [isPlaying, bpm, stepCount, shuffle]);

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
      prev.map(track => ({
        ...track,
        steps: new Array(64).fill(false),
        pitchMap: new Array(64).fill(1),
        velocityMap: new Array(64).fill(1),
      }))
    );
    setShuffle(0.0);
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

  const updateAllOperatorsADSR = (
    trackId: number,
    param: 'attack' | 'decay' | 'sustain' | 'release',
    value: number
  ) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId
          ? {
              ...track,
              operators: track.operators.map(op => ({ ...op, [param]: value })),
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

  const updateVelocityMap = (trackId: number, stepIndex: number, velocity: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId
          ? { ...track, velocityMap: track.velocityMap.map((v, i) => (i === stepIndex ? velocity : v)) }
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

  const togglePitchControl = (trackId: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, pitchControlVisible: !track.pitchControlVisible } : track
      )
    );
  };

  const toggleVelocityControl = (trackId: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, velocityControlVisible: !track.velocityControlVisible } : track
      )
    );
  };

  const toggleOperators = (trackId: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, operatorsExpanded: !track.operatorsExpanded } : track
      )
    );
  };

  const toggleLFOExpanded = (trackId: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, lfoExpanded: !track.lfoExpanded } : track
      )
    );
  };

  const togglePitchEnvExpanded = (trackId: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, pitchEnvExpanded: !track.pitchEnvExpanded } : track
      )
    );
  };

  const toggleDucking = (trackId: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, duckingEnabled: !track.duckingEnabled } : track
      )
    );
  };

  const toggleMute = (trackId: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, isMuted: !track.isMuted } : track
      )
    );
  };

  const copyTrackParams = (trackId: number) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    const params = {
      operators: track.operators,
      lfo: track.lfo,
      algorithm: track.algorithm,
      pitchEnvelope: track.pitchEnvelope,
      noteLength: track.noteLength,
      frequency: track.frequency,
    };

    const json = JSON.stringify(params, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      showToast('音色パラメータをコピーしました！');
    });
  };

  const pasteTrackParams = (trackId: number) => {
    navigator.clipboard.readText().then(text => {
      try {
        const params = JSON.parse(text);
        setTracks(prev =>
          prev.map(track => {
            if (track.id !== trackId) return track;
            return {
              ...track,
              operators: params.operators || track.operators,
              lfo: params.lfo || track.lfo,
              algorithm: params.algorithm || track.algorithm,
              pitchEnvelope: params.pitchEnvelope || track.pitchEnvelope,
              noteLength: params.noteLength || track.noteLength,
              frequency: params.frequency || track.frequency,
            };
          })
        );
        showToast('音色パラメータをペーストしました！');
      } catch {
        showToast('無効なパラメータです');
      }
    });
  };

  const resetToInitialSequence = () => {
    setTracks(prev =>
      prev.map((track, index) => {
        // Define initial settings for each track
        if (index === 0) {
          // Kick
          return {
            ...track,
            steps: new Array(64).fill(false).map((_, i) => i % 4 === 0 && i < 16),
            frequency: 55,
            operators: [
              { frequency: 55, ratio: 1.57, level: 0.30846065929062844, attack: 0.001, decay: 0.2924691461314984, sustain: 0.3052622340820058, release: 0.23572082996985017, feedbackAmount: 0.5519581506267578 },
              { frequency: 55, ratio: 1.48, level: 0.5927759298844391, attack: 0.001, decay: 0.09971183734862396, sustain: 0.15405327669189317, release: 0.33589217394922644, feedbackAmount: 0.7894718414985458 },
              { frequency: 55, ratio: 2.33, level: 0.30651959266073736, attack: 0.001, decay: 0.17247350678078033, sustain: 0.010876614372196836, release: 0.2998970050614464, feedbackAmount: 0.31942793972654543 },
              { frequency: 55, ratio: 1.88, level: 0.47632812369723265, attack: 0.001, decay: 0.15675361302425694, sustain: 0.33193765080781823, release: 0.08266122022775887, feedbackAmount: 0.2678397087736604 },
            ],
            lfo: { frequency: 7.289716616269852, depth: 0.2644860006832155 },
            algorithm: 'parallel' as FMAlgorithm,
            pitchEnvelope: { attack: 0.03263920787813766, decay: 0.0633337102583343, depth: 2 },
            pitchMap: new Array(64).fill(1),
            velocityMap: new Array(64).fill(1),
            noteLength: 1.0,
            lfoEnabled: true,
            pitchEnabled: true,
          };
        } else if (index === 1) {
          // Snare
          return {
            ...track,
            steps: new Array(64).fill(false).map((_, i) => (i === 4 || i === 12) && i < 16),
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
            velocityMap: new Array(64).fill(1),
            noteLength: 1.0,
            lfoEnabled: true,
            pitchEnabled: true,
          };
        } else if (index === 2) {
          // HiHat
          return {
            ...track,
            steps: new Array(64).fill(false).map((_, i) => i % 2 === 0 && i < 16),
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
            velocityMap: new Array(64).fill(1),
            noteLength: 0.5,
            lfoEnabled: true,
            pitchEnabled: false,
          };
        } else {
          // Tom
          return {
            ...track,
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
            velocityMap: new Array(64).fill(1),
            noteLength: 2.0,
            lfoEnabled: true,
            pitchEnabled: true,
          };
        }
      })
    );
    setShuffle(0.0);
    showToast('初期シーケンスと音色をロードしました！');
  };

  const updateDuckingAmount = (trackId: number, amount: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, duckingAmount: amount } : track
      )
    );
  };

  const updateDuckingRelease = (trackId: number, release: number) => {
    setTracks(prev =>
      prev.map(track =>
        track.id === trackId ? { ...track, duckingRelease: release } : track
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

  const randomizeSequence = (trackId: number) => {
    setTracks(prev =>
      prev.map(track => {
        if (track.id !== trackId) return track;

        // Generate random pattern with about 25% density
        const randomSteps = track.steps.map(() => Math.random() < 0.25);

        return {
          ...track,
          steps: randomSteps,
        };
      })
    );
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', background: '#2a2a2a', color: '#e0e0e0', padding: '20px', fontSize: '14px', minHeight: '100vh' }}>
      <h1 style={{ textAlign: 'center', fontSize: '28px', margin: '0 0 24px 0', fontWeight: '300', letterSpacing: '2px' }}>FM DRUM MACHINE</h1>

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
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {isPlaying ? <><FaPause /> STOP</> : <><FaPlay /> PLAY</>}
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

          <label style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Shuffle</span>
            <input
              type="range"
              value={shuffle}
              onChange={e => setShuffle(Number(e.target.value))}
              min={0}
              max={1}
              step={0.01}
              style={{
                width: '80px',
              }}
            />
            <span style={{ fontSize: '13px', color: '#999', minWidth: '40px' }}>{(shuffle * 100).toFixed(0)}%</span>
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
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <FaTrash /> CLEAR
          </button>

          <button
            onClick={resetToInitialSequence}
            style={{
              background: '#4a4a4a',
              color: '#e0e0e0',
              border: '1px solid #5a5a5a',
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <FaUndo /> RESET
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
                onClick={() => toggleMute(track.id)}
                style={{
                  background: track.isMuted ? '#d32f2f' : '#4a4a4a',
                  color: '#e0e0e0',
                  border: '1px solid #5a5a5a',
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {track.isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <FaRandom /> RAND
              </button>
              <button
                onClick={() => randomizeSequence(track.id)}
                style={{
                  background: '#4a4a4a',
                  color: '#e0e0e0',
                  border: '1px solid #5a5a5a',
                  padding: '6px 12px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <FaRandom /> SEQ
              </button>
              <button
                onClick={() => copyTrackParams(track.id)}
                style={{
                  background: '#4a4a4a',
                  color: '#e0e0e0',
                  border: '1px solid #5a5a5a',
                  padding: '6px 12px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <FaCopy />
              </button>
              <button
                onClick={() => pasteTrackParams(track.id)}
                style={{
                  background: '#4a4a4a',
                  color: '#e0e0e0',
                  border: '1px solid #5a5a5a',
                  padding: '6px 12px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <FaPaste />
              </button>
            </div>
          </div>

          {/* Note Sequencer - On/Off buttons */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '13px', marginBottom: '4px', color: '#999' }}>Notes</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(stepCount, 16)}, 1fr)`,
                gap: '4px',
              }}
            >
              {track.steps.slice(0, stepCount).map((active, i) => (
                <button
                  key={i}
                  onClick={() => toggleStep(track.id, i)}
                  style={{
                    aspectRatio: '1',
                    background: active ? '#ffffff' : '#4a4a4a',
                    border: i === currentStep && isPlaying ? '2px solid #e0e0e0' : '1px solid #5a5a5a',
                    cursor: 'pointer',
                    borderRadius: '2px',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Control Toggle Buttons */}
          <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
            <button
              onClick={() => togglePitchControl(track.id)}
              style={{
                background: track.pitchControlVisible ? '#ffffff' : '#4a4a4a',
                color: track.pitchControlVisible ? '#2a2a2a' : '#e0e0e0',
                border: '1px solid #5a5a5a',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                borderRadius: '4px',
                fontWeight: '500',
              }}
            >
              Pitch Control
            </button>
            <button
              onClick={() => toggleVelocityControl(track.id)}
              style={{
                background: track.velocityControlVisible ? '#ffffff' : '#4a4a4a',
                color: track.velocityControlVisible ? '#2a2a2a' : '#e0e0e0',
                border: '1px solid #5a5a5a',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                borderRadius: '4px',
                fontWeight: '500',
              }}
            >
              Velocity Control
            </button>
          </div>

          {/* Pitch Control - Independent input for each step */}
          {track.pitchEnabled && track.pitchControlVisible && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', marginBottom: '4px', color: '#999', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Pitch per Step (0.5x - 2.0x)</span>
                <span style={{ fontSize: '11px', color: '#777' }}>Drag to adjust pitch</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(stepCount, 16)}, 1fr)`,
                  gap: '4px',
                }}
              >
                {Array.from({ length: Math.min(stepCount, 16) }, (_, i) => {
                  const pitchMult = track.pitchMap[i] || 1;
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <RectSlider
                        value={pitchMult}
                        min={0.5}
                        max={2.0}
                        step={0.1}
                        onChange={(value) => updatePitchMap(track.id, i, value)}
                        opacity={track.steps[i] ? 1 : 0.5}
                      />
                      <div style={{ fontSize: '9px', color: track.steps[i] ? '#ffffff' : '#666', fontFamily: 'monospace', height: '12px' }}>
                        {pitchMult.toFixed(1)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Velocity Control - Independent input for each step */}
          {track.velocityControlVisible && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', marginBottom: '4px', color: '#999', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Velocity per Step (0.0 - 1.0)</span>
              <span style={{ fontSize: '11px', color: '#777' }}>Drag to adjust volume</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(stepCount, 16)}, 1fr)`,
                gap: '4px',
              }}
            >
              {Array.from({ length: Math.min(stepCount, 16) }, (_, i) => {
                const velocity = track.velocityMap[i] || 1;
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <RectSlider
                      value={velocity}
                      min={0.0}
                      max={1.0}
                      step={0.05}
                      onChange={(value) => updateVelocityMap(track.id, i, value)}
                      opacity={track.steps[i] ? 1 : 0.5}
                    />
                    <div style={{ fontSize: '9px', color: track.steps[i] ? '#ffffff' : '#666', fontFamily: 'monospace', height: '12px' }}>
                      {(velocity * 100).toFixed(0)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}

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
          </div>

          {/* LFO */}
          <div style={{ background: '#3a3a3a', padding: '12px', borderRadius: '4px', marginBottom: '12px' }}>
            <button
              onClick={() => toggleLFOExpanded(track.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#e0e0e0',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: track.lfoExpanded ? '12px' : '0',
              }}
            >
              {track.lfoExpanded ? <FaChevronUp /> : <FaChevronDown />}
              <input
                type="checkbox"
                checked={track.lfoEnabled}
                onChange={() => toggleLFO(track.id)}
                onClick={e => e.stopPropagation()}
                style={{ width: '16px', height: '16px', marginLeft: '8px' }}
              />
              LFO
            </button>

            {track.lfoExpanded && (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                  <LFOGraph
                    frequency={track.lfo.frequency}
                    depth={track.lfo.depth}
                    width={280}
                    height={80}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>Frequency</label>
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
                    <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>Depth</label>
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
                </div>
              </>
            )}
          </div>

          {/* Pitch Envelope */}
          <div style={{ background: '#3a3a3a', padding: '12px', borderRadius: '4px', marginBottom: '12px' }}>
            <button
              onClick={() => togglePitchEnvExpanded(track.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#e0e0e0',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: track.pitchEnvExpanded ? '12px' : '0',
              }}
            >
              {track.pitchEnvExpanded ? <FaChevronUp /> : <FaChevronDown />}
              <input
                type="checkbox"
                checked={track.pitchEnabled}
                onChange={() => togglePitch(track.id)}
                onClick={e => e.stopPropagation()}
                style={{ width: '16px', height: '16px', marginLeft: '8px' }}
              />
              Pitch Envelope
            </button>

            {track.pitchEnvExpanded && (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                  <PitchEnvelopeGraph
                    depth={track.pitchEnvelope.depth}
                    width={280}
                    height={80}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>Depth</label>
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
              </>
            )}
          </div>

          {/* Ducking - Only for tracks 2, 3, 4 */}
          {track.id >= 1 && track.duckingEnabled && (
            <div style={{ marginTop: '12px', padding: '12px', background: '#3a3a3a', borderRadius: '4px' }}>
              <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>Ducking from CH1</div>

              {/* Parameters */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>Duck Amount</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={track.duckingAmount}
                    onChange={e => updateDuckingAmount(track.id, Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{(track.duckingAmount * 100).toFixed(0)}%</div>
                </div>

                <div>
                  <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>Release Time</label>
                  <input
                    type="range"
                    min={0.01}
                    max={1}
                    step={0.01}
                    value={track.duckingRelease}
                    onChange={e => updateDuckingRelease(track.id, Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{track.duckingRelease.toFixed(2)}s</div>
                </div>
              </div>
            </div>
          )}

          {/* Ducking Toggle - Only for tracks 2, 3, 4 when disabled */}
          {track.id >= 1 && !track.duckingEnabled && (
            <div style={{ marginTop: '12px', padding: '12px', background: '#3a3a3a', borderRadius: '4px' }}>
              <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={track.duckingEnabled}
                  onChange={() => toggleDucking(track.id)}
                  style={{ width: '16px', height: '16px' }}
                />
                Enable Ducking from CH1
              </label>
            </div>
          )}

          {/* Ducking Toggle (when enabled) */}
          {track.id >= 1 && track.duckingEnabled && (
            <div style={{ marginTop: '12px', padding: '8px 12px', background: '#454545', borderRadius: '4px' }}>
              <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={track.duckingEnabled}
                  onChange={() => toggleDucking(track.id)}
                  style={{ width: '16px', height: '16px' }}
                />
                Ducking Enabled
              </label>
            </div>
          )}

          {/* Operators */}
          <div style={{ background: '#3a3a3a', padding: '12px', borderRadius: '4px', marginTop: '12px' }}>
            <button
              onClick={() => toggleOperators(track.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#e0e0e0',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: track.operatorsExpanded ? '12px' : '0',
              }}
            >
              {track.operatorsExpanded ? <FaChevronUp /> : <FaChevronDown />}
              Operators
            </button>

            {track.operatorsExpanded && (
            <>
              {/* Algorithm Selection - Toggle buttons with diagrams */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                {(['serial', 'parallel', 'hybrid1', 'hybrid2'] as const).map((algo) => (
                  <button
                    key={algo}
                    onClick={() => updateAlgorithm(track.id, algo)}
                    style={{
                      background: track.algorithm === algo ? '#ffffff' : '#4a4a4a',
                      border: track.algorithm === algo ? '2px solid #ffffff' : '1px solid #5a5a5a',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <FMAlgorithmDiagram
                      algorithm={algo}
                      hoveredOperator={
                        hoveredOperator?.trackId === track.id && typeof hoveredOperator.operatorIndex === 'number'
                          ? hoveredOperator.operatorIndex
                          : null
                      }
                      onHover={opIndex => {
                        if (opIndex === null) {
                          setHoveredOperator(prev => (prev?.trackId === track.id ? null : prev));
                        } else {
                          setHoveredOperator({ trackId: track.id, operatorIndex: opIndex });
                        }
                      }}
                    />
                    <span style={{ fontSize: '9px', color: track.algorithm === algo ? '#2a2a2a' : '#999', fontWeight: '500', textTransform: 'uppercase' }}>
                      {algo === 'hybrid1' ? 'H1' : algo === 'hybrid2' ? 'H2' : algo.slice(0, 3)}
                    </span>
                  </button>
                ))}
              </div>

              {/* Operators - 5 column layout */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
              {/* Unified ADSR Operator */}
              <div
                style={{
                  background:
                    hoveredOperator?.trackId === track.id && hoveredOperator.operatorIndex === 'all'
                      ? '#595959'
                      : '#454545',
                  padding: '10px',
                  borderRadius: '4px',
                  width: '100%',
                  maxWidth: '300px',
                  border:
                    hoveredOperator?.trackId === track.id && hoveredOperator.operatorIndex === 'all'
                      ? '2px solid #ffd966'
                      : '1px solid #5a5a5a',
                  transition: 'all 0.15s ease-out',
                  boxShadow:
                    hoveredOperator?.trackId === track.id && hoveredOperator.operatorIndex === 'all'
                      ? '0 8px 16px rgba(0,0,0,0.35)'
                      : 'none',
                }}
                onMouseEnter={() => setHoveredOperator({ trackId: track.id, operatorIndex: 'all' })}
                onMouseLeave={() =>
                  setHoveredOperator(prev => (prev?.trackId === track.id ? null : prev))
                }
              >
                <div style={{ fontWeight: '500', marginBottom: '8px', textAlign: 'center', fontSize: '13px', color: '#ffffff' }}>
                  ALL
                </div>

                <div style={{ marginBottom: '12px', width: '100%' }}>
                  <ADSRGraph
                    attack={track.operators[0]?.attack ?? 0}
                    decay={track.operators[0]?.decay ?? 0}
                    sustain={track.operators[0]?.sustain ?? 0}
                    release={track.operators[0]?.release ?? 0}
                    width={280}
                    height={120}
                    onAttackChange={(value) => updateAllOperatorsADSR(track.id, 'attack', value)}
                    onDecayChange={(value) => updateAllOperatorsADSR(track.id, 'decay', value)}
                    onSustainChange={(value) => updateAllOperatorsADSR(track.id, 'sustain', value)}
                    onReleaseChange={(value) => updateAllOperatorsADSR(track.id, 'release', value)}
                  />
                </div>
              </div>

              {/* Individual Operators with Rotary Knobs */}
              {track.operators.map((op, opIndex) => {
                const isHovered =
                  hoveredOperator?.trackId === track.id && hoveredOperator.operatorIndex === opIndex;

                return (
                  <div
                    key={opIndex}
                    style={{
                      background: isHovered ? '#595959' : '#454545',
                      padding: '10px',
                      borderRadius: '4px',
                      width: '100%',
                      maxWidth: '300px',
                      border: isHovered ? '2px solid #ffd966' : '1px solid #5a5a5a',
                      transition: 'all 0.15s ease-out',
                      boxShadow: isHovered ? '0 8px 16px rgba(0,0,0,0.35)' : 'none',
                    }}
                    onMouseEnter={() => setHoveredOperator({ trackId: track.id, operatorIndex: opIndex })}
                    onMouseLeave={() =>
                      setHoveredOperator(prev => (prev?.trackId === track.id ? null : prev))
                    }
                  >
                    <div
                      style={{
                        fontWeight: '500',
                        marginBottom: '8px',
                        textAlign: 'center',
                        fontSize: '13px',
                        color: '#ffffff',
                      }}
                    >
                      OP{opIndex + 1}
                    </div>

                  {/* ADSR Graph */}
                  <div style={{ marginBottom: '12px', width: '100%' }}>
                    <ADSRGraph
                      attack={op.attack}
                      decay={op.decay}
                      sustain={op.sustain}
                      release={op.release}
                      width={280}
                      height={120}
                      onAttackChange={(value) => updateOperator(track.id, opIndex, 'attack', value)}
                      onDecayChange={(value) => updateOperator(track.id, opIndex, 'decay', value)}
                      onSustainChange={(value) => updateOperator(track.id, opIndex, 'sustain', value)}
                      onReleaseChange={(value) => updateOperator(track.id, opIndex, 'release', value)}
                    />
                  </div>

                  {/* Rotary Knobs */}
                  <div style={{ display: 'flex', justifyContent: 'space-around', gap: '8px' }}>
                    <RotaryKnob
                      value={op.ratio}
                      min={0.1}
                      max={16}
                      step={0.01}
                      onChange={(value) => updateOperator(track.id, opIndex, 'ratio', value)}
                      label="Ratio"
                      size={50}
                    />
                    <RotaryKnob
                      value={op.level}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(value) => updateOperator(track.id, opIndex, 'level', value)}
                      label="Level"
                      size={50}
                    />
                    <RotaryKnob
                      value={op.feedbackAmount}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(value) => updateOperator(track.id, opIndex, 'feedbackAmount', value)}
                      label="FB"
                      size={50}
                    />
                  </div>
                </div>
                );
              })}
              </div>
            </>
            )}
          </div>
        </div>
      ))}

      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#323232',
            color: '#e0e0e0',
            padding: '12px 24px',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
};
