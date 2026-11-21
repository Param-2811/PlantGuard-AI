'use client';

import ConfidenceBar from './ConfidenceBar';

interface ResultCardProps {
  disease: string;
  plant: string;
  confidence: number;
  isHealthy: boolean;
  modelName?: string;
}

export default function ResultCard({ disease, plant, confidence, isHealthy, modelName }: ResultCardProps) {
  return (
    <div className="card punch" style={{ padding: 24, paddingTop: 40, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <span className="tag">{plant}</span>
        {modelName ? <span className="tag">{modelName}</span> : null}
        <span className={`tag ${isHealthy ? 'tag-accent' : 'tag-alert'}`}>
          <span className="tag-dot" />
          {isHealthy ? 'No anomaly detected' : 'Anomaly detected'}
        </span>
      </div>

      <h2 className="font-display" style={{
        fontSize: 24,
        color: isHealthy ? 'var(--accent-hover)' : 'var(--danger-hover)',
        marginBottom: 10,
      }}>
        {disease}
      </h2>

      <div className="font-mono" style={{ fontSize: 32, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
        {confidence.toFixed(2)}%
      </div>

      <ConfidenceBar confidence={confidence} />
    </div>
  );
}
