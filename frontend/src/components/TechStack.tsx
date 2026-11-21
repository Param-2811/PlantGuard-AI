'use client';

export default function TechStack() {
  const techs = [
    { name: 'PyTorch', desc: 'EfficientNet-B6 model loading and inference' },
    { name: 'FastAPI', desc: 'Backend API for image analysis and AI chat' },
    { name: 'Next.js', desc: 'Frontend interface for upload, results, and chat' },
    { name: 'Ollama Cloud', desc: 'AI treatment guidance and crop Q&A' },
  ];

  return (
    <section style={{ padding: '72px 24px 96px', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <span className="tag tag-accent" style={{ marginBottom: 16 }}>Instrumentation</span>

        <h2 className="font-display" style={{ fontSize: 'clamp(28px, 4vw, 40px)', color: 'var(--text)', marginBottom: 10, letterSpacing: '-0.01em' }}>
          Built on a practical AI/ML stack
        </h2>

        <p style={{ fontSize: 15.5, color: 'var(--text-muted)', maxWidth: 520, lineHeight: 1.7, marginBottom: 44 }}>
          Open-source tools power the detection flow, frontend, backend, and AI assistant.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {techs.map((t) => (
            <div key={t.name} style={{
              flex: '1 1 220px', padding: '20px 24px 20px 0',
              borderTop: '1px solid var(--border)',
            }}>
              <div className="font-display" style={{ fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>{t.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
