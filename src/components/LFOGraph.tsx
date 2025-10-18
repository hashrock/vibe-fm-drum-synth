import { useEffect, useRef } from 'react';

interface LFOGraphProps {
  frequency: number;
  depth: number;
  width?: number;
  height?: number;
}

export const LFOGraph = ({ frequency, depth, width = 200, height = 60 }: LFOGraphProps) => {
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
    const centerY = height / 2;

    // Grid
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);

    // Center line
    ctx.beginPath();
    ctx.moveTo(padding, centerY);
    ctx.lineTo(padding + graphWidth, centerY);
    ctx.stroke();

    // Top and bottom lines
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding + graphWidth, padding);
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(padding + graphWidth, height - padding);
    ctx.stroke();

    ctx.setLineDash([]);

    // LFO waveform (sine wave)
    const cycles = Math.max(1, Math.min(4, frequency / 10)); // Show 1-4 cycles based on frequency
    const points = 200;

    ctx.strokeStyle = '#90caf9';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i <= points; i++) {
      const x = padding + (i / points) * graphWidth;
      const phase = (i / points) * cycles * Math.PI * 2;
      const amplitude = (depth / 4) * (graphHeight / 2); // depth max is 4
      const y = centerY + Math.sin(phase) * amplitude;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Fill under wave
    ctx.fillStyle = 'rgba(144, 202, 249, 0.12)';
    ctx.beginPath();
    ctx.moveTo(padding, centerY);

    for (let i = 0; i <= points; i++) {
      const x = padding + (i / points) * graphWidth;
      const phase = (i / points) * cycles * Math.PI * 2;
      const amplitude = (depth / 4) * (graphHeight / 2);
      const y = centerY + Math.sin(phase) * amplitude;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(padding + graphWidth, centerY);
    ctx.closePath();
    ctx.fill();

    // Labels
    ctx.fillStyle = '#999';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${frequency.toFixed(1)} Hz`, padding + 4, padding + 12);
    ctx.textAlign = 'right';
    ctx.fillText(`±${depth.toFixed(2)}`, width - padding - 4, padding + 12);
  }, [frequency, depth, width, height]);

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
