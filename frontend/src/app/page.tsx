'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';

import AIChatPanel from '@/components/AIChatPanel';
import AdviceBox from '@/components/AdviceBox';
import DiseaseLibrary from '@/components/DiseaseLibrary';
import Footer from '@/components/Footer';
import HowItWorks from '@/components/HowItWorks';
import NetworkStatus from '@/components/NetworkStatus';
import ResultCard from '@/components/ResultCard';
import TechStack from '@/components/TechStack';
import UploadZone from '@/components/UploadZone';

const LOADING_TEXTS = [
  'Preparing image for analysis...',
  'Scanning leaf texture and vein patterns...',
  'Comparing against disease signatures...',
  'Running classifier on 38 disease classes...',
  'Cross-checking confidence scores...',
  'Building diagnosis summary...',
  'Generating treatment guidance...',
  'Finalizing your result...',
];

export default function App() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [adviceText, setAdviceText] = useState('');
  const [adviceStreaming, setAdviceStreaming] = useState(false);
  const adviceAbortRef = useRef<AbortController | null>(null);
  const resultSectionRef = useRef<HTMLElement | null>(null);
  const adviceSectionRef = useRef<HTMLDivElement | null>(null);
  const chatSectionRef = useRef<HTMLDivElement | null>(null);

  const [loadingIndex, setLoadingIndex] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  useEffect(() => {
    if (!loading) return undefined;
    const interval = setInterval(() => setLoadingIndex((p) => (p + 1) % LOADING_TEXTS.length), 1100);
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (!loading) return undefined;
    const progressTimer = setInterval(() => {
      setAnalysisProgress((prev) => {
        if (prev >= 92) return prev;
        const step = Math.random() < 0.35 ? 2 : 1;
        return Math.min(92, prev + step);
      });
    }, 180);
    return () => clearInterval(progressTimer);
  }, [loading]);

  useEffect(() => {
    return () => {
      adviceAbortRef.current?.abort();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const loadingText = useMemo(() => LOADING_TEXTS[loadingIndex], [loadingIndex]);

  const clearHashFromUrl = () => {
    if (typeof window === 'undefined') return;
    if (!window.location.hash) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  };

  const scrollToSection = (id: string, behavior: ScrollBehavior = 'smooth') => {
    const target = document.getElementById(id);
    if (!target) return;
    const navOffset = 76;
    const top = target.getBoundingClientRect().top + window.scrollY - navOffset;
    window.scrollTo({ top: Math.max(0, top), behavior });
  };

  const handleSectionLink = (
    event: React.MouseEvent<HTMLAnchorElement>,
    id: string,
    resetBeforeScroll = false,
  ) => {
    event.preventDefault();
    if (resetBeforeScroll) handleReset();
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`);
    requestAnimationFrame(() => scrollToSection(id));
  };

  const scrollToResult = () => {
    resultSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToAdvice = () => {
    adviceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToAiAssistant = () => {
    chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const streamAdvice = async (analysis: AnalysisResult) => {
    adviceAbortRef.current?.abort();
    const controller = new AbortController();
    adviceAbortRef.current = controller;

    setAdviceText('');
    setAdviceStreaming(true);

    try {
      const response = await fetch('http://localhost:8000/advice/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disease: analysis.disease,
          plant: analysis.plant,
          confidence: analysis.confidence,
          is_healthy: analysis.is_healthy,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const detail = await response.text();
        throw new Error(detail || `Advice stream failed with HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        setAdviceText((prev) => prev + chunk);
      }
    } catch (error: any) {
      if (controller.signal.aborted) return;
      const message = typeof error?.message === 'string' ? error.message : 'Advice stream failed.';
      setAdviceText((prev) =>
        prev
          ? `${prev}\n\n${message}`
          : `## Advice Unavailable\n- ${message}`
      );
    } finally {
      if (!controller.signal.aborted) {
        setAdviceStreaming(false);
      }
    }
  };

  const handleUploadStart = (nextPreviewUrl: string) => {
    clearHashFromUrl();
    adviceAbortRef.current?.abort();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(nextPreviewUrl);
    setResult(null);
    setErrorMessage('');
    setAdviceText('');
    setAdviceStreaming(false);
    setLoading(true);
    setLoadingIndex(0);
    setAnalysisProgress(3);
  };

  const handleUploadSuccess = (data: AnalysisResult) => {
    clearHashFromUrl();
    setAnalysisProgress(100);
    setResult(data);
    setLoading(false);
    setAdviceText(data.advice || '');
    void streamAdvice(data);
  };

  const handleUploadError = (message: string) => {
    adviceAbortRef.current?.abort();
    setAnalysisProgress(0);
    setLoading(false);
    setAdviceStreaming(false);
    setAdviceText('');
    setErrorMessage(message);
  };

  const goHome = (event: React.MouseEvent) => {
    event.preventDefault();
    handleReset();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReset = () => {
    clearHashFromUrl();
    adviceAbortRef.current?.abort();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setResult(null);
    setLoading(false);
    setLoadingIndex(0);
    setAnalysisProgress(0);
    setErrorMessage('');
    setAdviceText('');
    setAdviceStreaming(false);
  };

  return (
    <div style={{ background: 'var(--bg)' }}>
      <NetworkStatus />

      {/* Navigation */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        height: 64,
        background: 'rgba(247,248,241,0.9)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}>
        <div style={{
          maxWidth: 1180, width: '100%', margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <a
            href="/"
            onClick={goHome}
            style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', cursor: 'pointer' }}
          >
            <div style={{
              width: 26, height: 26, background: 'var(--accent)', borderRadius: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M4 20C4 11 11 4 20 4C20 13 13 20 4 20Z" fill="#fff" />
                <path d="M4 20L20 4" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
            <span className="font-display" style={{ fontSize: 17, color: 'var(--text)' }}>
              PlantGuard <span style={{ color: 'var(--accent)' }}>AI</span>
            </span>
          </a>

          <div className="hidden md:flex" style={{ alignItems: 'center', gap: 26, fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: 'var(--font-mono), monospace' }}>
            {result ? (
              <>
                <button type="button" style={navButtonStyle} onClick={scrollToResult}>Result</button>
                <button type="button" style={navButtonStyle} onClick={scrollToAdvice}>Advice</button>
                <button type="button" style={navButtonStyle} onClick={scrollToAiAssistant}>Ask AI</button>
              </>
            ) : (
              <>
                <a href="#detect" style={navLinkStyle} onClick={(event) => handleSectionLink(event, 'detect', true)}>Detect</a>
                <a href="#how-it-works" style={navLinkStyle} onClick={(event) => handleSectionLink(event, 'how-it-works')}>Method</a>
                <a href="#diseases" style={navLinkStyle} onClick={(event) => handleSectionLink(event, 'diseases')}>Index</a>
                <a href="#technology" style={navLinkStyle} onClick={(event) => handleSectionLink(event, 'technology')}>Stack</a>
              </>
            )}
          </div>

          <a
            href="#detect"
            onClick={(event) => handleSectionLink(event, 'detect', true)}
            className="btn btn-primary"
            style={{ fontSize: 12.5, padding: '9px 16px' }}
          >
            Try it &rarr;
          </a>
        </div>
      </nav>

      {/* HERO Section */}
      {!loading && !result && (
        <section className="field-grid">
          <div className="grid-2" style={{
            gap: 56,
            alignItems: 'center',
            maxWidth: 1180,
            margin: '0 auto',
            padding: '80px 24px 110px',
          }}>
            {/* Hero left */}
            <div className="fade-in">
              <div className="tag tag-accent" style={{ marginBottom: 24 }}>
                <span className="tag-dot" />
                Specimen No. 001 &mdash; Field Index
              </div>
              <h1 className="font-display" style={{
                fontSize: 'clamp(34px, 6.4vw, 68px)', lineHeight: 1.04, color: 'var(--text)', marginBottom: 24, letterSpacing: '-0.01em',
              }}>
                Read the leaf before the crop tells you.
              </h1>
              <p style={{
                fontSize: 17, color: 'var(--text-muted)', lineHeight: 1.7,
                marginBottom: 32, maxWidth: 460,
              }}>
                Photograph one leaf. The classifier cross-references it against
                38 catalogued disease and healthy classes spanning 14 plant
                species, then returns a confidence reading and treatment notes.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 40 }}>
                <a
                  href="#detect"
                  onClick={(event) => handleSectionLink(event, 'detect')}
                  className="btn btn-primary"
                  style={{ fontSize: 15, padding: '13px 24px' }}
                >
                  Analyze my plant
                </a>
                <a
                  href="#how-it-works"
                  onClick={(event) => handleSectionLink(event, 'how-it-works')}
                  className="btn btn-secondary"
                  style={{ fontSize: 15, padding: '13px 24px' }}
                >
                  Read the method
                </a>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                {[
                  { value: 'B6', label: 'EfficientNet model' },
                  { value: '38', label: 'Supported classes' },
                  { value: '384px', label: 'Input resolution' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div className="font-mono" style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)' }}>{stat.value}</div>
                    <div className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Detection card (right) */}
            <div id="detect" className="fade-in delay-2" style={{ position: 'relative' }}>
              <DetectionCard
                previewUrl={previewUrl}
                onSubmit={handleUploadStart}
                onSuccess={handleUploadSuccess}
                onError={handleUploadError}
                errorMessage={errorMessage}
              />
            </div>
          </div>
        </section>
      )}

      {/* Analysis States */}
      {loading && result === null && (
        <section id="detect" style={{ maxWidth: 1180, margin: '0 auto', padding: '80px 24px' }}>
          <div className="card" style={{
            maxWidth: 480, margin: '0 auto', padding: 20, boxShadow: 'var(--shadow-md)',
          }}>
            <div className="tag tag-accent" style={{ marginBottom: 16 }}>
              <span className="tag-dot" />
              Scanning specimen
            </div>

            {previewUrl && (
              <div style={{
                position: 'relative', overflow: 'hidden', border: '1px solid var(--line-strong)',
                marginBottom: 20, background: 'var(--paper)',
              }}>
                <Image
                  src={previewUrl}
                  alt="Uploaded leaf"
                  width={440}
                  height={260}
                  unoptimized
                  style={{ width: '100%', height: 260, objectFit: 'cover', display: 'block' }}
                />
                <div className="scan-grid" aria-hidden="true" />
                <div className="scan-line" aria-hidden="true" />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <p className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Scan progress
              </p>
              <span className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-hover)' }}>
                {analysisProgress}%
              </span>
            </div>
            <div style={{ position: 'relative', height: 10, border: '1px solid var(--line-strong)', marginBottom: 20 }}>
              <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'repeating-linear-gradient(90deg, var(--line) 0, var(--line) 1px, transparent 1px, transparent 10%)',
              }} />
              <div style={{
                position: 'absolute', inset: 0, width: `${analysisProgress}%`,
                background: 'var(--accent)', transition: 'width 0.25s linear',
              }} />
            </div>

            <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              {loadingText}
            </p>
            <p className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Keep this window open while the model runs.
            </p>
          </div>
        </section>
      )}

      {/* Result State */}
      {result && (
        <section id="detect" ref={resultSectionRef} style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 24px 72px' }}>
          <div className="fade-in grid-2" style={{
            gap: 24, marginBottom: 24,
          }}>
            <div className="card" style={{ overflow: 'hidden', padding: 12, boxShadow: 'var(--shadow-sm)' }}>
              {previewUrl ? (
                <Image
                  src={previewUrl}
                  alt="Analyzed leaf"
                  width={1000}
                  height={320}
                  unoptimized
                  style={{ width: '100%', height: 320, objectFit: 'cover', borderRadius: 2 }}
                />
              ) : (
                <div style={{
                  height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-subtle)', borderRadius: 2, color: 'var(--text-muted)', fontSize: 14,
                }}>
                  No preview available
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ResultCard
                disease={result.disease}
                plant={result.plant}
                confidence={result.confidence}
                isHealthy={result.is_healthy}
                modelName={result.model_name}
              />
              <button type="button" onClick={handleReset} className="btn btn-primary" style={{ width: '100%', fontSize: 15, padding: '13px 24px' }}>
                Analyze Another Leaf &rarr;
              </button>
              <button type="button" onClick={scrollToAiAssistant} className="btn btn-secondary" style={{ width: '100%', fontSize: 15, padding: '13px 24px' }}>
                Ask AI Assistant &darr;
              </button>
            </div>
          </div>

          <div id="advice" ref={adviceSectionRef} style={{ marginBottom: 24 }}>
            <AdviceBox advice={adviceText || result.advice || ''} isStreaming={adviceStreaming} />
          </div>

          <div id="ai-assistant" ref={chatSectionRef} style={{ marginBottom: 12 }}>
            <AIChatPanel disease={result.disease} plant={result.plant} />
          </div>
        </section>
      )}

      {!result && (
        <>
          <div id="how-it-works">
            <HowItWorks />
          </div>
          <div id="diseases">
            <DiseaseLibrary />
          </div>
          <div id="technology">
            <TechStack />
          </div>
          <Footer />
        </>
      )}
    </div>
  );
}

const navLinkStyle: React.CSSProperties = {
  textDecoration: 'none',
  color: 'var(--text-muted)',
  transition: 'color 0.15s',
};

const navButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--text-muted)',
  cursor: 'pointer',
  transition: 'color 0.15s',
  font: 'inherit',
};

/* ── Detection Card (hero right) ── */

function DetectionCard({
  previewUrl,
  onSubmit,
  onSuccess,
  onError,
  errorMessage,
}: {
  previewUrl: string;
  onSubmit: (url: string) => void;
  onSuccess: (data: AnalysisResult) => void;
  onError: (message: string) => void;
  errorMessage: string;
}) {
  return (
    <div className="card punch" style={{ padding: 28, paddingTop: 40, boxShadow: 'var(--shadow-lg)' }}>
      <div className="tag" style={{ marginBottom: 16 }}>
        <span className="tag-dot" style={{ background: 'var(--accent)' }} />
        Live B6 detection
      </div>

      <UploadZone
        onSubmit={onSubmit}
        onSuccess={onSuccess}
        onError={onError}
        previewUrl={previewUrl}
      />

      {errorMessage ? (
        <div style={{
          marginTop: 16,
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--danger-border)',
          background: 'var(--danger-soft)',
          color: 'var(--danger-hover)',
          padding: 14,
          fontSize: 13,
          lineHeight: 1.6,
        }}>
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}

interface AnalysisResult {
  raw_class: string;
  disease: string;
  plant: string;
  confidence: number;
  is_healthy: boolean;
  advice: string;
  model_name?: string;
  advice_unavailable?: boolean;
  advice_error?: string | null;
}
