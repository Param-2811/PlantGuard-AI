'use client';

import ReactMarkdown from 'react-markdown';

interface AdviceBoxProps {
  advice: string;
  isStreaming?: boolean;
}

interface Section {
  title: string;
  content: string;
}

function normalizeAdviceMarkdown(markdown: string): string {
  const normalizedLines = markdown
    .replace(/�/g, '')
    // The model occasionally emits "<br>• next point" instead of a real new
    // bullet — turn that into an actual markdown list item. Any other stray
    // <br> becomes a hard line break (two trailing spaces) rather than a
    // literal tag, since react-markdown doesn't render raw HTML.
    .replace(/<br\s*\/?>\s*•\s*/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '  \n')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed.includes('|')) return line;

      const cells = trimmed.split('|').map((cell) => cell.trim()).filter(Boolean);
      if (!cells.length) return '';

      const separatorLike = cells.every((cell) => /^[-:]+$/.test(cell));
      if (separatorLike) return '';

      if (cells.length === 1) return `- ${cells[0]}`;
      return `- ${cells.join(' - ')}`;
    });

  return normalizedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function toSections(markdown: string): Section[] {
  const cleanMarkdown = normalizeAdviceMarkdown(markdown);
  const lines = cleanMarkdown.split('\n');
  const sections: Section[] = [];
  let currentTitle = 'Advice';
  const currentLines: string[] = [];

  lines.forEach((line) => {
    if (line.startsWith('## ')) {
      if (currentLines.length || currentTitle !== 'Advice') {
        sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
      }
      currentTitle = line.replace('## ', '').trim();
      currentLines.length = 0;
    } else {
      currentLines.push(line);
    }
  });

  if (currentLines.length || currentTitle !== 'Advice') {
    sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
  }

  if (!sections.length) {
    return [{ title: 'Advice', content: cleanMarkdown }];
  }

  return sections;
}

export default function AdviceBox({ advice, isStreaming = false }: AdviceBoxProps) {
  const hasAdvice = Boolean(advice && advice.trim());
  const sections = hasAdvice ? toSections(advice) : [];

  return (
    <div className="card punch" style={{ padding: 28, paddingTop: 40, boxShadow: 'var(--shadow-sm)' }}>
      <h3 className="font-display" style={{
        marginBottom: 20,
        fontSize: 19,
        color: 'var(--text)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        Treatment Notes
        {isStreaming ? (
          <span className="tag tag-accent" style={{ animation: 'pulse-soft 1.4s ease-in-out infinite', fontSize: 10 }}>
            Live
          </span>
        ) : null}
      </h3>

      {!hasAdvice ? (
        <article
          style={{
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
            padding: 20,
            fontSize: 14,
            color: 'var(--text-muted)',
            lineHeight: 1.6,
          }}
        >
          {isStreaming ? 'Generating treatment advice...' : 'No advice returned from the model.'}
        </article>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sections.map((section, index) => (
          <article
            key={`${section.title}-${index}`}
            style={{
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg-subtle)',
              padding: 20,
            }}
          >
            <h4 style={{
              marginBottom: 12,
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text)',
            }}>
              {section.title}
            </h4>
            <div style={{
              fontSize: 14,
              lineHeight: 1.7,
              color: 'var(--text-muted)',
              maxWidth: '70ch',
            }}>
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p style={{ marginBottom: 8 }}>{children}</p>,
                  ul: ({ children }) => (
                    <ul style={{ listStyle: 'disc', paddingLeft: 20, marginBottom: 8 }}>
                      {children}
                    </ul>
                  ),
                  li: ({ children }) => (
                    <li style={{ marginBottom: 4, lineHeight: 1.6 }}>{children}</li>
                  ),
                  strong: ({ children }) => <strong style={{ color: 'var(--text)' }}>{children}</strong>,
                }}
              >
                {section.content || '-'}
              </ReactMarkdown>
            </div>
          </article>
        ))}
      </div>

      {hasAdvice && isStreaming ? (
        <div style={{
          marginTop: 14,
          fontSize: 12,
          color: 'var(--text-muted)',
          animation: 'pulse-soft 1.6s ease-in-out infinite',
        }}>
          AI is still writing...
        </div>
      ) : null}
    </div>
  );
}
