import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';

interface RotaryKnobProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  label: string;
  size?: number;
}

const START_ANGLE = -135;
const END_ANGLE = 135;
const ANGLE_RANGE = END_ANGLE - START_ANGLE;
const DRAG_PIXEL_RANGE = 160; // Roughly how many pixels map to the full value range during dragging.

const toRadians = (angle: number) => (angle * Math.PI) / 180;

const polarToCartesian = (cx: number, cy: number, radius: number, angle: number) => {
  const rad = toRadians(angle);

  return {
    x: cx + Math.sin(rad) * radius,
    y: cy - Math.cos(rad) * radius,
  };
};

const describeArc = (
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) => {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const delta = Math.abs(endAngle - startAngle);
  const largeArcFlag = delta >= 180 ? 1 : 0;
  const sweepFlag = endAngle >= startAngle ? 1 : 0;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
};

const getDecimalPlaces = (step: number) => {
  const stepString = step.toString();
  const fraction = stepString.split('.')[1];

  return fraction ? Math.min(fraction.length, 4) : 0;
};

export const RotaryKnob = ({
  value,
  min,
  max,
  step,
  onChange,
  label,
  size = 50,
}: RotaryKnobProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const pointerIdRef = useRef<number | null>(null);
  const dragStartValueRef = useRef(value);
  const dragStartClientYRef = useRef(0);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const clampValue = useCallback((next: number) => Math.min(max, Math.max(min, next)), [max, min]);

  const quantize = useCallback(
    (raw: number) => {
      if (step <= 0) {
        return clampValue(raw);
      }

      const relative = (raw - min) / step;
      const snapped = Math.round(relative) * step + min;

      return clampValue(Number(snapped.toFixed(6)));
    },
    [clampValue, min, step],
  );

  const updateValue = useCallback(
    (next: number) => {
      const clamped = quantize(next);

      if (clamped !== value) {
        onChange(clamped);
      }
    },
    [onChange, quantize, value],
  );

  const range = max - min;
  const safeNormalizedValue = useMemo(() => {
    if (range <= 0) {
      return 0;
    }

    const normalized = (clampValue(value) - min) / range;

    return Math.min(1, Math.max(0, normalized));
  }, [clampValue, min, range, value]);

  const angle = START_ANGLE + safeNormalizedValue * ANGLE_RANGE;
  const center = size / 2;
  const radius = center - 5;
  const pointerLength = radius * 0.7;

  const pointerPosition = useMemo(() => {
    const rad = toRadians(angle);

    return {
      x: center + Math.sin(rad) * pointerLength,
      y: center - Math.cos(rad) * pointerLength,
    };
  }, [angle, center, pointerLength]);

  const valueArcPath = useMemo(() => {
    if (safeNormalizedValue <= 0) {
      return null;
    }

    const endAngle = START_ANGLE + safeNormalizedValue * ANGLE_RANGE;

    return describeArc(center, center, radius, START_ANGLE, endAngle);
  }, [center, radius, safeNormalizedValue]);

  const displayDecimals = useMemo(() => Math.max(0, getDecimalPlaces(step)), [step]);
  const displayValue = useMemo(
    () => clampValue(value).toFixed(Math.max(2, displayDecimals)),
    [clampValue, displayDecimals, value],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      event.preventDefault();
      dragStartClientYRef.current = event.clientY;
      dragStartValueRef.current = value;
      pointerIdRef.current = event.pointerId;
      svgRef.current = event.currentTarget;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setIsDragging(true);
    },
    [value],
  );

  useEffect(() => {
    if (!isDragging) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerIdRef.current) {
        return;
      }

      const deltaY = dragStartClientYRef.current - event.clientY;
      const deltaValue = (range / DRAG_PIXEL_RANGE) * deltaY;
      const nextValue = dragStartValueRef.current + deltaValue;

      updateValue(nextValue);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerIdRef.current) {
        return;
      }

      pointerIdRef.current = null;
      svgRef.current?.releasePointerCapture?.(event.pointerId);
      svgRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, range, updateValue]);

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      const multiplier = event.shiftKey ? 10 : 1;
      const nextValue = value + step * multiplier * direction;

      updateValue(nextValue);
    },
    [step, updateValue, value],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      let nextValue = value;

      switch (event.key) {
        case 'ArrowUp':
        case 'ArrowRight':
          nextValue = value + step * (event.shiftKey ? 10 : 1);
          break;
        case 'ArrowDown':
        case 'ArrowLeft':
          nextValue = value - step * (event.shiftKey ? 10 : 1);
          break;
        case 'Home':
          nextValue = min;
          break;
        case 'End':
          nextValue = max;
          break;
        default:
          return;
      }

      event.preventDefault();
      updateValue(nextValue);
    },
    [max, min, step, updateValue, value],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(clampValue(value).toFixed(3))}
        aria-valuetext={displayValue}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
        style={{
          outline: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <svg
          ref={svgRef}
          width={size}
          height={size}
          onPointerDown={handlePointerDown}
          style={{ userSelect: 'none', touchAction: 'none', borderRadius: '50%' }}
        >
          <circle cx={center} cy={center} r={radius} fill="#262626" stroke="#3c3c3c" strokeWidth={2} />

          <path
            d={describeArc(center, center, radius, START_ANGLE, END_ANGLE)}
            fill="none"
            stroke="#4e4e4e"
            strokeWidth={3}
            strokeLinecap="round"
          />

          {valueArcPath && (
            <path d={valueArcPath} fill="none" stroke="#f0f0f0" strokeWidth={3} strokeLinecap="round" />
          )}

          <line
            x1={center}
            y1={center}
            x2={pointerPosition.x}
            y2={pointerPosition.y}
            stroke="#f8f8f8"
            strokeWidth={2}
            strokeLinecap="round"
          />

          <circle cx={center} cy={center} r={3} fill="#f8f8f8" />
        </svg>
      </div>

      <div style={{ fontSize: '10px', color: '#a8a8a8', textAlign: 'center', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: '11px', color: '#e6e6e6', fontFamily: 'monospace' }}>{displayValue}</div>
    </div>
  );
};
