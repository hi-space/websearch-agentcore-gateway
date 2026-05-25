import React from 'react';

// Inline sparkline; renders nothing when there's not enough data.
export function Sparkline({
  values,
  width = 120,
  height = 32,
  stroke = 'currentColor',
  fill = 'none',
  ariaLabel
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  ariaLabel?: string;
}) {
  if (values.length < 2) {
    return (
      <div
        aria-label={ariaLabel ?? 'no data'}
        className="text-caption text-stone italic"
        style={{ width, height, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        no data
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * stepX).toFixed(2)},${(height - ((v - min) / range) * height).toFixed(2)}`)
    .join(' ');
  return (
    <svg width={width} height={height} role="img" aria-label={ariaLabel} className="text-primary">
      <polyline points={points} fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
