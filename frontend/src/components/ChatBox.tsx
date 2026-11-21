'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface ChatBoxProps {
  disease: string;
  plant: string;
  isVisible: boolean;
  onClose: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatBox({ disease, plant, isVisible, onClose }: ChatBoxProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isHealthy = (disease || '').toLowerCase() === 'healthy';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!isVisible) {
      setMessages([]);
      setInput('');
      setLoading(false);
    }
  }, [isVisible]);

  const sendMessage = async () => {
    const question = input.trim();
    if (!question) return;

    const userMsg: Message = { role: 'user', content: question };
    setInput('');
    setLoading(true);
    setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch('http://localhost:8000/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disease, plant, question }),
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

  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 96,
      right: 24,
      width: 'min(22rem, calc(100vw - 48px))',
      height: 480,
      maxHeight: '70vh',
      background: 'var(--white)',
      borderRadius: 20,
      boxShadow: '0 16px 48px rgba(0,0,0,0.12)',
      border: '1px solid #e5e7eb',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      zIndex: 70,
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(to right, var(--g), #2d5a0e)',
        color: '#fff',
        padding: '14px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Disease Assistant 🌿</div>
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
            {isHealthy ? `Healthy ${plant} leaf` : `${disease} · ${plant}`}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: 'none',
            color: '#fff',
            width: 28,
            height: 28,
            borderRadius: 8,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 16,
        background: '#f8f9fa',
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, marginTop: 32 }}>
            <div style={{ marginBottom: 8 }}>👋 Ask me about:</div>
            <div style={{ fontSize: 11, lineHeight: 1.8 }}>
              {isHealthy ? (
                <>
                  <div>Growth timeline</div>
                  <div>Watering and fertilizer</div>
                  <div>Harvest timing</div>
                  <div>How to keep healthy</div>
                </>
              ) : (
                <>
                  <div>Treatment options</div>
                  <div>Prevention methods</div>
                  <div>Symptoms to watch</div>
                  <div>Fungicide recommendations</div>
                </>
              )}
            </div>
          </div>
        )}

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
              maxWidth: '85%',
              padding: '8px 14px',
              borderRadius: 14,
              fontSize: 13,
              lineHeight: 1.5,
              background: msg.role === 'user' ? 'var(--g)' : '#e5e7eb',
              color: msg.role === 'user' ? '#fff' : '#1f2937',
              borderBottomRightRadius: msg.role === 'user' ? 4 : 14,
              borderBottomLeftRadius: msg.role === 'assistant' ? 4 : 14,
            }}>
              {msg.role === 'assistant' ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p style={{ margin: '2px 0' }}>{children}</p>,
                    ul: ({ children }) => <ul style={{ margin: '2px 0', paddingLeft: 16, listStyle: 'disc' }}>{children}</ul>,
                    li: ({ children }) => <li style={{ margin: 0 }}>{children}</li>,
                    strong: ({ children }) => <strong style={{ color: 'inherit' }}>{children}</strong>,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
            <div style={{
              padding: '8px 14px',
              borderRadius: 14,
              borderBottomLeftRadius: 4,
              fontSize: 13,
              background: '#e5e7eb',
              color: '#1f2937',
            }}>
              <span style={{ animation: 'pulse-soft 2s infinite' }}>Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        borderTop: '1px solid #e5e7eb',
        padding: 12,
        background: 'var(--white)',
        display: 'flex',
        gap: 8,
      }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Ask a question..."
          disabled={loading}
          style={{
            flex: 1,
            padding: '10px 14px',
            border: '1px solid #d1d5db',
            borderRadius: 10,
            fontSize: 13,
            outline: 'none',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--g)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,109,17,0.1)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.boxShadow = 'none'; }}
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          style={{
            background: 'var(--g)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.5 : 1,
            transition: 'background 0.2s',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
