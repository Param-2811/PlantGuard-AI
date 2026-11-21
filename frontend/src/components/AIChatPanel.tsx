'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface AIChatPanelProps {
  disease: string;
  plant: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function normalizeChatMarkdown(markdown: string): string {
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

const HEALTHY_PROMPTS = [
  'How to keep this plant healthy?',
  'Best weekly care routine?',
  'What nutrients should I use?',
];

const DISEASE_PROMPTS = [
  'What should I do first?',
  'How should I treat it?',
  'How can I prevent it next time?',
];

export default function AIChatPanel({ disease, plant }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);

  const isHealthy = (disease || '').trim().toLowerCase() === 'healthy';
  const quickPrompts = isHealthy ? HEALTHY_PROMPTS : DISEASE_PROMPTS;

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    setMessages([]);
    setInput('');
    setLoading(false);
  }, [disease, plant]);

  const sendMessage = async (prefill?: string) => {
    const question = (prefill ?? input).trim();
    if (!question || loading) return;

    const userMsg: Message = { role: 'user', content: question };
    const history = messages.filter((msg) => msg.content.trim());
    setInput('');
    setLoading(true);
    setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch('http://localhost:8000/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disease, plant, question, history }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const detail = await response.text();
        throw new Error(detail || `Chat request failed with HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;

        setMessages((prev) => {
          if (!prev.length) return prev;
          const next = [...prev];
          const lastIndex = next.length - 1;
          const last = next[lastIndex];

          if (last.role !== 'assistant') {
            next.push({ role: 'assistant', content: chunk });
            return next;
          }

          next[lastIndex] = { ...last, content: last.content + chunk };
          return next;
        });
      }

      setMessages((prev) => {
        if (!prev.length) return prev;
        const next = [...prev];
        const lastIndex = next.length - 1;
        const last = next[lastIndex];
        if (last.role === 'assistant' && !last.content.trim()) {
          next[lastIndex] = { role: 'assistant', content: 'No response returned from the model.' };
        }
        return next;
      });
    } catch (error: any) {
      let errorMsg = 'Sorry, I could not process your question. Please try again.';
      const message = typeof error?.message === 'string' ? error.message : '';
      if (message) errorMsg = message;
      if (error?.name === 'AbortError') errorMsg = 'Request timed out. The model may be busy.';
      if (message.includes('Failed to fetch')) {
        errorMsg = 'Cannot connect to chat service. Make sure the backend is running.';
      }

      setMessages((prev) => {
        if (!prev.length) return [{ role: 'assistant', content: errorMsg }];
        const next = [...prev];
        const lastIndex = next.length - 1;
        const last = next[lastIndex];
        if (last.role === 'assistant' && !last.content.trim()) {
          next[lastIndex] = { role: 'assistant', content: errorMsg };
          return next;
        }
        next.push({ role: 'assistant', content: errorMsg });
        return next;
      });
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  return (
    <div className="card punch" style={{ padding: 24, paddingTop: 40, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ marginBottom: 14 }}>
        <h3 className="font-display" style={{ margin: 0, fontSize: 19, color: 'var(--text)' }}>
          Ask the field assistant
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
          Ask about care, treatment, prevention, and next steps for {plant} {isHealthy ? '(healthy)' : `with ${disease}`}.
        </p>
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 14,
      }}>
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={loading}
            onClick={() => sendMessage(prompt)}
            style={{
              border: '1px solid var(--line-strong)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontFamily: 'var(--font-mono), monospace',
              padding: '7px 12px',
              fontSize: 12,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="scroll-thin" style={{
        height: 380,
        overflowY: 'auto',
        border: '1px solid var(--border)',
        background: 'var(--paper)',
        padding: 14,
        marginBottom: 12,
      }} ref={messagesViewportRef}>
        {messages.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
            Ask a practical question about this result.
          </div>
        ) : null}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 10,
            }}
          >
            <div style={{
              maxWidth: '90%',
              padding: '10px 14px',
              fontSize: 14,
              lineHeight: 1.6,
              background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface)',
              color: msg.role === 'user' ? 'var(--paper-raised)' : 'var(--text)',
              border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
            }}>
              {msg.role === 'assistant' ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p style={{ margin: '4px 0' }}>{children}</p>,
                    ul: ({ children }) => <ul style={{ margin: '6px 0', paddingLeft: 20 }}>{children}</ul>,
                    li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
                    h1: ({ children }) => <p style={{ margin: '6px 0 4px', fontWeight: 700 }}>{children}</p>,
                    h2: ({ children }) => <p style={{ margin: '6px 0 4px', fontWeight: 700 }}>{children}</p>,
                    h3: ({ children }) => <p style={{ margin: '6px 0 4px', fontWeight: 700 }}>{children}</p>,
                    strong: ({ children }) => <strong style={{ color: 'inherit' }}>{children}</strong>,
                  }}
                >
                  {normalizeChatMarkdown(msg.content)}
                </ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', animation: 'pulse-soft 1.6s infinite' }}>
            AI is writing...
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Ask a follow-up question..."
          disabled={loading}
          style={{
            flex: 1,
            padding: '12px 14px',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => sendMessage()}
          disabled={loading}
          className="btn btn-primary"
          style={{
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.65 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
