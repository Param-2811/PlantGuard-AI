'use client';

export default function HowItWorks() {
  const steps = [
    {
      num: '01',
      title: 'Upload leaf photo',
      desc: 'Take a clear close-up photo of one leaf and upload it from your phone or computer.',
    },
    {
      num: '02',
      title: 'AI analyzes image',
      desc: 'EfficientNet-B6 checks the leaf image for patterns learned from disease and healthy classes.',
    },
    {
      num: '03',
      title: 'Get diagnosis & treatment',
      desc: 'Review the predicted class, confidence score, and practical treatment guidance.',
    },
  ];

  return (
    <section style={{ padding: '96px 24px', maxWidth: 1180, margin: '0 auto' }} id="how-it-works">
      <span className="tag tag-accent" style={{ marginBottom: 16 }}>Procedure</span>

      <h2 className="font-display" style={{ fontSize: 'clamp(28px, 4vw, 40px)', color: 'var(--text)', marginBottom: 10, letterSpacing: '-0.01em' }}>
        Three steps to a diagnosis
      </h2>

      <p style={{ fontSize: 15.5, color: 'var(--text-muted)', maxWidth: 480, lineHeight: 1.7 }}>
        The model supports 38 disease and healthy classes across 14 plant types.
      </p>

      <div className="grid-3" style={{ position: 'relative', gap: 32, marginTop: 56 }}>
        <div className="step-rail" aria-hidden="true" />
        {steps.map((step) => (
          <div key={step.num} style={{ textAlign: 'center' }}>
            <div className="font-mono" style={{
              width: 44, height: 44, background: 'var(--paper-raised)', border: '1.5px solid var(--ink)',
              color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 600, margin: '0 auto 20px', position: 'relative',
              clipPath: 'polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%)',
            }}>
              {step.num}
            </div>
            <div className="font-display" style={{ fontSize: 17, marginBottom: 8, color: 'var(--text)' }}>{step.title}</div>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 280, margin: '0 auto' }}>{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
