'use client';

const plants = [
  { name: 'Apple', classes: 4 },
  { name: 'Bell Pepper', classes: 2 },
  { name: 'Blueberry', classes: 1 },
  { name: 'Cherry', classes: 2 },
  { name: 'Corn / Maize', classes: 4 },
  { name: 'Grape', classes: 4 },
  { name: 'Orange', classes: 1 },
  { name: 'Peach', classes: 2 },
  { name: 'Potato', classes: 3 },
  { name: 'Raspberry', classes: 1 },
  { name: 'Soybean', classes: 1 },
  { name: 'Squash', classes: 1 },
  { name: 'Strawberry', classes: 2 },
  { name: 'Tomato', classes: 10 },
];

const totalPlants = plants.length;

function LeafMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3.5c-5 0-8 3.8-8 8.9 0 4.3 3.3 7.7 8 8.1 4.7-.4 8-3.8 8-8.1 0-5.1-3-8.9-8-8.9Z"
        stroke="var(--accent)" strokeWidth="1.5"
      />
      <path d="M12 5v14.5M12 9.5c-1.6 0-2.9.8-3.7 1.7M12 13.5c1.6 0 2.9-.8 3.7-1.7"
        stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

type PlantCardProps = { name: string; classes: number };

function PlantCard({ name, classes }: PlantCardProps) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
        borderBottom: '1px solid var(--border)', transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{
        width: 32, height: 32, border: '1px solid var(--line-strong)', background: 'var(--accent-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <LeafMark />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--text)' }}>{name}</div>
      </div>
      <div className="font-mono" style={{ fontSize: 11.5, color: 'var(--accent-hover)', fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '0.03em' }}>
        {String(classes).padStart(2, '0')} {classes === 1 ? 'CLASS' : 'CLASSES'}
      </div>
    </div>
  );
}

export default function DiseaseLibrary() {
  const half = Math.ceil(plants.length / 2);
  const columns = [plants.slice(0, half), plants.slice(half)];

  return (
    <section style={{ background: 'var(--bg-subtle)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ padding: '96px 24px', maxWidth: 1180, margin: '0 auto' }}>
        <span className="tag tag-accent" style={{ marginBottom: 16 }}>Specimen index</span>

        <h2 className="font-display" style={{ fontSize: 'clamp(28px, 4vw, 40px)', color: 'var(--text)', marginBottom: 10, letterSpacing: '-0.01em' }}>
          {totalPlants} plants, catalogued
        </h2>

        <p style={{ fontSize: 15.5, color: 'var(--text-muted)', maxWidth: 520, lineHeight: 1.7 }}>
          Our model supports common disease and healthy classes across these crop types.
        </p>

        <div className="card" style={{ marginTop: 40, overflow: 'hidden' }}>
          <div className="grid-2">
            {columns.map((col, i) => (
              <div key={i} className={i === 1 ? 'plant-col-divider' : undefined}>
                {col.map((plant) => (
                  <PlantCard key={plant.name} {...plant} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
