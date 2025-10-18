import { useRef, useEffect } from 'react';

interface ADSRGraphProps {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  width?: number;
  height?: number;
}

export const ADSRGraph = ({ attack, decay, sustain, release, width = 200, height = 80 }: ADSRGraphProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate total time and positions
    const totalTime = attack + decay + 0.5 + release; // 0.5s for sustain visualization
    const padding = 10;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    // Calculate x positions
    const attackX = (attack / totalTime) * graphWidth;
    const decayX = attackX + (decay / totalTime) * graphWidth;
    const sustainX = decayX + (0.5 / totalTime) * graphWidth;
    const releaseX = sustainX + (release / totalTime) * graphWidth;

    // Calculate y positions
    const peakY = padding;
    const sustainY = padding + (1 - sustain) * graphHeight;
    const endY = padding + graphHeight;

    // Draw grid lines
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 0.5;

    // Horizontal grid lines
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

    // Start point
    ctx.moveTo(padding, endY);

    // Attack phase
    ctx.lineTo(padding + attackX, peakY);

    // Decay phase
    ctx.lineTo(padding + decayX, sustainY);

    // Sustain phase
    ctx.lineTo(padding + sustainX, sustainY);

    // Release phase
    ctx.lineTo(padding + releaseX, endY);

    ctx.stroke();

    // Draw fill under envelope
    ctx.fillStyle = 'rgba(144, 202, 249, 0.1)';
    ctx.beginPath();
    ctx.moveTo(padding, endY);
    ctx.lineTo(padding + attackX, peakY);
    ctx.lineTo(padding + decayX, sustainY);
    ctx.lineTo(padding + sustainX, sustainY);
    ctx.lineTo(padding + releaseX, endY);
    ctx.closePath();
    ctx.fill();

    // Draw labels
    ctx.fillStyle = '#999';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';

    if (attackX > 20) {
      ctx.fillText('A', padding + attackX / 2, endY + 8);
    }
    if (decayX - attackX > 20) {
      ctx.fillText('D', padding + attackX + (decayX - attackX) / 2, endY + 8);
    }
    if (sustainX - decayX > 20) {
      ctx.fillText('S', padding + decayX + (sustainX - decayX) / 2, endY + 8);
    }
    if (releaseX - sustainX > 20) {
      ctx.fillText('R', padding + sustainX + (releaseX - sustainX) / 2, endY + 8);
    }
  }, [attack, decay, sustain, release, width, height]);

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
