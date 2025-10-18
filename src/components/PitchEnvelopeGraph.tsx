import { useEffect, useRef } from 'react';

interface PitchEnvelopeGraphProps {
  depth: number;
  width?: number;
  height?: number;
}

export const PitchEnvelopeGraph = ({ depth, width = 200, height = 60 }: PitchEnvelopeGraphProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const padding = 10;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;
    const baseY = padding + graphHeight;

    // Grid
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);

    // Horizontal grid lines
    for (let i = 0; i <= 2; i++) {
      const y = padding + (i / 2) * graphHeight;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + graphWidth, y);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // Pitch envelope curve (exponential decay from depth to 0)
    const points = 100;
    const decayRate = 5; // Controls how fast it decays

    ctx.strokeStyle = '#90caf9';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i <= points; i++) {
      const x = padding + (i / points) * graphWidth;
      const t = i / points;
      // Exponential decay: starts at depth, decays to 0
      const pitchValue = depth * Math.exp(-decayRate * t);
      const normalizedValue = pitchValue / 2; // depth max is 2
      const y = baseY - normalizedValue * graphHeight;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.lineTo(padding + graphWidth, baseY);
    ctx.stroke();

    // Fill under envelope
    ctx.fillStyle = 'rgba(144, 202, 249, 0.12)';
    ctx.beginPath();
    ctx.moveTo(padding, baseY);

    for (let i = 0; i <= points; i++) {
      const x = padding + (i / points) * graphWidth;
      const t = i / points;
      const pitchValue = depth * Math.exp(-decayRate * t);
      const normalizedValue = pitchValue / 2;
      const y = baseY - normalizedValue * graphHeight;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(padding + graphWidth, baseY);
    ctx.closePath();
    ctx.fill();

    // Labels
    ctx.fillStyle = '#999';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('Pitch', padding + 4, padding + 12);
    ctx.textAlign = 'right';
    ctx.fillText(`${depth.toFixed(2)}x`, width - padding - 4, padding + 12);
  }, [depth, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        border: '1px solid #4a4a4a',
        borderRadius: '4px',
        background: '#2a2a2a',
      }}
    />
  );
};
