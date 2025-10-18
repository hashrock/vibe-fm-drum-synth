import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';

interface ADSRGraphProps {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  width?: number;
  height?: number;
  onAttackChange?: (value: number) => void;
  onDecayChange?: (value: number) => void;
  onSustainChange?: (value: number) => void;
  onReleaseChange?: (value: number) => void;
}

type ControlPoint = 'attack' | 'decay' | 'sustain' | 'release' | null;

const MIN_TIME = 0;
const MAX_ATTACK = 0.1; // Matches slider range for attack
const MAX_DECAY = 1;
const MAX_RELEASE = 1;
const SUSTAIN_DISPLAY_TIME = 0.3; // Visual-only sustain duration
const HANDLE_RADIUS = 8;

const roundAttack = (value: number) => Number(value.toFixed(3));
const roundTime = (value: number) => Number(value.toFixed(2));
const roundSustain = (value: number) => Number(value.toFixed(2));

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getCursor = (point: ControlPoint) => {
  switch (point) {
    case 'sustain':
      return 'ns-resize';
    case 'decay':
      return 'move';
    case 'attack':
    case 'release':
      return 'ew-resize';
    default:
      return 'default';
  }
};

export const ADSRGraph = ({
  attack,
  decay,
  sustain,
  release,
  width = 200,
  height = 80,
  onAttackChange,
  onDecayChange,
  onSustainChange,
  onReleaseChange,
}: ADSRGraphProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState<ControlPoint>(null);
  const [hovering, setHovering] = useState<ControlPoint>(null);

  const padding = 10;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;
  const baseY = padding + graphHeight;

  const displayAttack = clamp(attack, MIN_TIME, MAX_ATTACK);
  const displayDecay = clamp(decay, MIN_TIME, MAX_DECAY);
  const displayRelease = clamp(release, MIN_TIME, MAX_RELEASE);
  const sustainLevel = clamp(sustain, 0, 1);

  const xScale = graphWidth / (MAX_ATTACK + MAX_DECAY + MAX_RELEASE + SUSTAIN_DISPLAY_TIME);
  const sustainHoldWidth = SUSTAIN_DISPLAY_TIME * xScale;

  const positions = useMemo(() => {
    const attackX = padding + displayAttack * xScale;
    const decayX = attackX + displayDecay * xScale;
    const sustainX = decayX + sustainHoldWidth;
    const releaseX = sustainX + displayRelease * xScale;
    const sustainY = padding + (1 - sustainLevel) * graphHeight;

    return {
      attack: { x: attackX, y: padding },
      decay: { x: decayX, y: sustainY },
      sustain: { x: sustainX, y: sustainY },
      release: { x: releaseX, y: baseY },
    };
  }, [baseY, displayAttack, displayDecay, displayRelease, graphHeight, padding, sustainHoldWidth, sustainLevel, xScale]);

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let target: ControlPoint = null;
    for (const [key, pos] of Object.entries(positions) as [ControlPoint, { x: number; y: number }][]) {
      const distance = Math.hypot(x - pos.x, y - pos.y);
      if (distance <= HANDLE_RADIUS) {
        target = key;
        break;
      }
    }

    if (target) {
      e.preventDefault();
      setDragging(target);
    }
  };

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const boundedX = clamp(x, padding, padding + graphWidth);
    const boundedY = clamp(y, padding, padding + graphHeight);

    if (dragging) {
      switch (dragging) {
        case 'attack': {
          const relativeX = boundedX - padding;
          const newAttack = clamp(relativeX / xScale, MIN_TIME, MAX_ATTACK);
          onAttackChange?.(roundAttack(newAttack));
          break;
        }
        case 'decay': {
          const attackStartX = padding + displayAttack * xScale;
          const relativeX = clamp(boundedX - attackStartX, 0, MAX_DECAY * xScale);
          const newDecay = clamp(relativeX / xScale, MIN_TIME, MAX_DECAY);
          const normalizedY = 1 - (boundedY - padding) / graphHeight;
          const newSustain = clamp(normalizedY, 0, 1);
          onDecayChange?.(roundTime(newDecay));
          onSustainChange?.(roundSustain(newSustain));
          break;
        }
        case 'sustain': {
          const normalizedY = 1 - (boundedY - padding) / graphHeight;
          const newSustain = clamp(normalizedY, 0, 1);
          onSustainChange?.(roundSustain(newSustain));
          break;
        }
        case 'release': {
          const sustainStartX = positions.sustain.x;
          const relativeX = clamp(boundedX - sustainStartX, 0, MAX_RELEASE * xScale);
          const newRelease = clamp(relativeX / xScale, MIN_TIME, MAX_RELEASE);
          onReleaseChange?.(roundTime(newRelease));
          break;
        }
      }
    } else {
      let hoverTarget: ControlPoint = null;
      for (const [key, pos] of Object.entries(positions) as [ControlPoint, { x: number; y: number }][]) {
        const distance = Math.hypot(boundedX - pos.x, boundedY - pos.y);
        if (distance <= HANDLE_RADIUS) {
          hoverTarget = key;
          break;
        }
      }
      setHovering(hoverTarget);
    }
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  const handleMouseLeave = () => {
    setDragging(null);
    setHovering(null);
  };

  useEffect(() => {
    if (!dragging) return;
    const handleGlobalMouseUp = () => setDragging(null);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [dragging]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (i / 4) * graphHeight;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + graphWidth, y);
      ctx.stroke();
    }

    // Envelope path
    ctx.strokeStyle = '#90caf9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, baseY);
    ctx.lineTo(positions.attack.x, positions.attack.y);
    ctx.lineTo(positions.decay.x, positions.decay.y);
    ctx.lineTo(positions.sustain.x, positions.sustain.y);
    ctx.lineTo(positions.release.x, positions.release.y);
    ctx.stroke();

    // Fill under envelope
    ctx.fillStyle = 'rgba(144, 202, 249, 0.12)';
    ctx.beginPath();
    ctx.moveTo(padding, baseY);
    ctx.lineTo(positions.attack.x, positions.attack.y);
    ctx.lineTo(positions.decay.x, positions.decay.y);
    ctx.lineTo(positions.sustain.x, positions.sustain.y);
    ctx.lineTo(positions.release.x, positions.release.y);
    ctx.lineTo(positions.release.x, baseY);
    ctx.closePath();
    ctx.fill();

    // Sustain guide
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(positions.sustain.x, padding);
    ctx.lineTo(positions.sustain.x, baseY);
    ctx.stroke();
    ctx.setLineDash([]);

    const drawHandle = (point: ControlPoint) => {
      if (!point) return;
      const pos = positions[point];
      const isHover = hovering === point;
      const isDrag = dragging === point;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isDrag ? 7 : isHover ? 6 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isDrag ? '#ffffff' : isHover ? '#e0e0e0' : '#90caf9';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#1f1f1f';
      ctx.stroke();
    };

    drawHandle('attack');
    drawHandle('decay');
    drawHandle('sustain');
    drawHandle('release');

    // Labels
    ctx.fillStyle = '#999';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';

    const attackWidth = displayAttack * xScale;
    const decayWidth = displayDecay * xScale;
    const releaseWidth = displayRelease * xScale;

    if (attackWidth > 12) {
      ctx.fillText('A', padding + attackWidth / 2, baseY + 10);
    }
    if (decayWidth > 12) {
      ctx.fillText('D', positions.attack.x + decayWidth / 2, baseY + 10);
    }
    if (sustainHoldWidth > 12) {
      ctx.fillText('S', positions.decay.x + sustainHoldWidth / 2, baseY + 10);
    }
    if (releaseWidth > 12) {
      ctx.fillText('R', positions.sustain.x + releaseWidth / 2, baseY + 10);
    }
  }, [baseY, displayAttack, displayDecay, displayRelease, graphHeight, graphWidth, height, hovering, padding, positions, sustainHoldWidth, width]);

  const cursor = dragging ? getCursor(dragging) : getCursor(hovering);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{
        border: '1px solid #4a4a4a',
        borderRadius: '4px',
        background: '#2a2a2a',
        cursor,
        touchAction: 'none',
      }}
    />
  );
};
