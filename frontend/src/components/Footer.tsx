'use client';

export default function Footer() {
  return (
    <footer style={{ background: 'var(--bg-subtle)', borderTop: '1px solid var(--border)', color: 'var(--text-muted)', padding: '48px 24px 36px', textAlign: 'center' }}>
      <div className="font-display" style={{ fontSize: 20, color: 'var(--text)', marginBottom: 12 }}>
        PlantGuard <span style={{ color: 'var(--accent)' }}>AI</span>
      </div>
      <p style={{ fontSize: 13, maxWidth: '60ch', margin: '0 auto' }}>
        Free plant disease detection powered by AI/ML &middot; Open source &middot; For farmers &amp; researchers
      </p>
      <p style={{ marginTop: 8, fontSize: 12, maxWidth: '60ch', margin: '8px auto 0' }}>
        Built with EfficientNet-B6 &middot; PyTorch &middot; FastAPI &middot; Next.js
      </p>
      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', maxWidth: '60ch', margin: '16px auto 0' }}>
        Param&apos;s Project &middot; 2026
      </p>
    </footer>
  );
}
