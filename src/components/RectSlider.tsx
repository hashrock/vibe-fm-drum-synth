import { useState, useRef, useEffect } from 'react';

interface RectSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  opacity?: number;
}

export const RectSlider = ({
  value,
  min,
  max,
  step,
  onChange,
  disabled = false,
  opacity = 1,
}: RectSliderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedValue = (value - min) / (max - min);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;
    setIsDragging(true);
    updateValue(e.clientY);
  };

  const updateValue = (clientY: number) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const ratio = 1 - y / rect.height; // Inverted: top = max, bottom = min
    const rawValue = min + ratio * (max - min);
    const steppedValue = Math.round(rawValue / step) * step;
    const clampedValue = Math.max(min, Math.min(max, steppedValue));

    onChange(clampedValue);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateValue(e.clientY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      style={{
        position: 'relative',
        width: '100%',
        height: '60px',
        background: '#2a2a2a',
        border: '1px solid #4a4a4a',
        borderRadius: '2px',
        cursor: disabled ? 'default' : 'pointer',
        opacity,
        userSelect: 'none',
      }}
    >
      {/* Fill bar from bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: `${normalizedValue * 100}%`,
          background: disabled ? '#555' : '#90caf9',
          transition: isDragging ? 'none' : 'height 0.1s ease',
        }}
      />

      {/* Value indicator line */}
      <div
        style={{
          position: 'absolute',
          bottom: `${normalizedValue * 100}%`,
          left: 0,
          width: '100%',
          height: '2px',
          background: '#e0e0e0',
          transform: 'translateY(1px)',
        }}
      />
    </div>
  );
};
