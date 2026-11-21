'use client';

import { useEffect, useState } from 'react';

interface ConfidenceBarProps {
  confidence: number;
}

const TICKS = 10;

export default function ConfidenceBar({ confidence }: ConfidenceBarProps) {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    setAnimatedValue(0);
    const timer = setTimeout(() => setAnimatedValue(confidence), 120);
    return () => clearTimeout(timer);
  }, [confidence]);

  const tone =
    confidence > 85 ? 'var(--accent)' : confidence >= 60 ? 'var(--ochre)' : 'var(--danger)';

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontFamily: 'var(--font-mono), monospace', fontSize: 11, fontWeight: 600,
        color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8,
      }}>
        <span>Confidence reading</span>
        <span style={{ color: tone }}>{animatedValue.toFixed(1)}%</span>
      </div>

      <div style={{ position: 'relative', height: 16, border: '1px solid var(--line-strong)' }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `repeating-linear-gradient(90deg, var(--line) 0, var(--line) 1px, transparent 1px, transparent ${100 / TICKS}%)`,
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          width: `${animatedValue}%`,
          background: tone,
          opacity: 0.9,
          transition: 'width 0.7s ease-out',
        }} />
        <div style={{
          position: 'absolute', top: -3, bottom: -3,
          left: `${animatedValue}%`,
          width: 2,
          background: 'var(--ink)',
          transform: 'translateX(-1px)',
          transition: 'left 0.7s ease-out',
        }} />
      </div>
    </div>
  );
}
