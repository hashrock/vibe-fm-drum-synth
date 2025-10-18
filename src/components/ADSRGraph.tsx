import { useRef, useEffect, useState } from 'react';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<ControlPoint>(null);
  const [hovering, setHovering] = useState<ControlPoint>(null);

  const padding = 10;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;

  // Calculate positions
  const calculatePositions = () => {
    const totalTime = attack + decay + 0.5 + release;
    const attackX = (attack / totalTime) * graphWidth;
    const decayX = attackX + (decay / totalTime) * graphWidth;
    const sustainX = decayX + (0.5 / totalTime) * graphWidth;
    const releaseX = sustainX + (release / totalTime) * graphWidth;

    const peakY = padding;
    const sustainY = padding + (1 - sustain) * graphHeight;
    const endY = padding + graphHeight;

    return {
      attack: { x: padding + attackX, y: peakY },
      decay: { x: padding + decayX, y: sustainY },
      sustain: { x: padding + sustainX, y: sustainY },
      release: { x: padding + releaseX, y: endY },
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const positions = calculatePositions();
    const hitRadius = 8;

    // Check which control point was clicked (except release - it's not draggable)
    for (const [key, pos] of Object.entries(positions)) {
      if (key === 'release') continue; // Release point is not draggable
      const distance = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
      if (distance <= hitRadius) {
        setDragging(key as ControlPoint);
        return;
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragging) {
      // Update values based on dragging
      const relativeX = Math.max(0, Math.min(graphWidth, x - padding));
      const relativeY = Math.max(0, Math.min(graphHeight, y - padding));
      const normalizedY = 1 - relativeY / graphHeight;

      switch (dragging) {
        case 'attack': {
          // Attack time is controlled by X position
          const totalTime = attack + decay + 0.5 + release;
          const ratio = relativeX / graphWidth;
          const newAttack = Math.max(0, Math.min(0.1, ratio * totalTime * 0.4));
          onAttackChange?.(newAttack);
          break;
        }
        case 'decay': {
          // Decay time is controlled by X position, sustain level by Y
          const totalTime = attack + decay + 0.5 + release;
          const attackRatio = attack / totalTime;
          const ratio = relativeX / graphWidth - attackRatio;
          const newDecay = Math.max(0, Math.min(1, ratio * totalTime * 1.5));
          const newSustain = Math.max(0, Math.min(1, normalizedY));
          onDecayChange?.(newDecay);
          onSustainChange?.(newSustain);
          break;
        }
        case 'sustain': {
          // Sustain point controls release time (X) and sustain level (Y)
          const totalTime = attack + decay + 0.5 + release;
          const sustainDuration = 0.5; // Fixed sustain visualization duration

          // Calculate current sustain end position
          const sustainEndX = ((attack + decay + sustainDuration) / totalTime) * graphWidth;

          // Calculate how far from sustain end the user wants
          const distanceFromSustainEnd = relativeX - sustainEndX;

          // Convert to release time (positive distance = longer release)
          const newRelease = Math.max(0, Math.min(1, (distanceFromSustainEnd / graphWidth) * totalTime * 2));
          const newSustain = Math.max(0, Math.min(1, normalizedY));
          onReleaseChange?.(newRelease);
          onSustainChange?.(newSustain);
          break;
        }
        case 'release': {
          // Release point is at the end - no interaction needed (controlled by sustain point)
          break;
        }
      }
    } else {
      // Check hovering (except release - it's not draggable)
      const positions = calculatePositions();
      const hitRadius = 8;
      let foundHover: ControlPoint = null;

      for (const [key, pos] of Object.entries(positions)) {
        if (key === 'release') continue; // Release point is not hoverable
        const distance = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
        if (distance <= hitRadius) {
          foundHover = key as ControlPoint;
          break;
        }
      }

      setHovering(foundHover);
    }
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  const handleMouseLeave = () => {
    setDragging(null);
    setHovering(null);
  };

  // Global mouse up handler
  useEffect(() => {
    if (dragging) {
      const handleGlobalMouseUp = () => setDragging(null);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [dragging]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const positions = calculatePositions();

    // Draw grid lines
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 0.5;

    for (let i = 0; i <= 4; i++) {
      const y = padding + (i / 4) * graphHeight;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + graphWidth, y);
      ctx.stroke();
    }

    // Draw ADSR envelope
    ctx.strokeStyle = '#90caf9';
    ctx.lineWidth = 2;
    ctx.beginPath();

    ctx.moveTo(padding, padding + graphHeight);
    ctx.lineTo(positions.attack.x, positions.attack.y);
    ctx.lineTo(positions.decay.x, positions.decay.y);
    ctx.lineTo(positions.sustain.x, positions.sustain.y);
    ctx.lineTo(positions.release.x, positions.release.y);

    ctx.stroke();

    // Draw fill under envelope
    ctx.fillStyle = 'rgba(144, 202, 249, 0.1)';
    ctx.beginPath();
    ctx.moveTo(padding, padding + graphHeight);
    ctx.lineTo(positions.attack.x, positions.attack.y);
    ctx.lineTo(positions.decay.x, positions.decay.y);
    ctx.lineTo(positions.sustain.x, positions.sustain.y);
    ctx.lineTo(positions.release.x, positions.release.y);
    ctx.closePath();
    ctx.fill();

    // Draw control points
    const drawControlPoint = (pos: { x: number; y: number }, key: ControlPoint, interactive: boolean = true) => {
      const isHovering = hovering === key;
      const isDragging = dragging === key;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isDragging ? 6 : isHovering ? 5 : 4, 0, 2 * Math.PI);

      if (interactive) {
        ctx.fillStyle = isDragging ? '#ffffff' : isHovering ? '#e0e0e0' : '#90caf9';
      } else {
        // Non-interactive point - dimmed
        ctx.fillStyle = '#666666';
      }

      ctx.fill();
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = interactive ? 2 : 1;
      ctx.stroke();
    };

    drawControlPoint(positions.attack, 'attack', true);
    drawControlPoint(positions.decay, 'decay', true);
    drawControlPoint(positions.sustain, 'sustain', true);
    drawControlPoint(positions.release, 'release', false); // Release is not interactive

    // Draw labels
    ctx.fillStyle = '#999';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';

    const totalTime = attack + decay + 0.5 + release;
    const attackWidth = (attack / totalTime) * graphWidth;
    const decayWidth = (decay / totalTime) * graphWidth;
    const sustainWidth = (0.5 / totalTime) * graphWidth;
    const releaseWidth = (release / totalTime) * graphWidth;

    if (attackWidth > 20) {
      ctx.fillText('A', padding + attackWidth / 2, padding + graphHeight + 8);
    }
    if (decayWidth > 20) {
      ctx.fillText('D', padding + attackWidth + decayWidth / 2, padding + graphHeight + 8);
    }
    if (sustainWidth > 20) {
      ctx.fillText('S', padding + attackWidth + decayWidth + sustainWidth / 2, padding + graphHeight + 8);
    }
    if (releaseWidth > 20) {
      ctx.fillText('R', padding + attackWidth + decayWidth + sustainWidth + releaseWidth / 2, padding + graphHeight + 8);
    }
  }, [attack, decay, sustain, release, width, height, hovering, dragging]);

  return (
    <div ref={containerRef} style={{ display: 'inline-block' }}>
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
          cursor: dragging ? 'grabbing' : hovering ? 'grab' : 'default',
        }}
      />
    </div>
  );
};
