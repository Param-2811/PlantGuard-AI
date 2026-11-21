'use client';

import { useRef, useState, DragEvent, ChangeEvent, ClipboardEvent } from 'react';
import axios from 'axios';

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface UploadZoneProps {
  onSubmit: (previewUrl: string) => void;
  onSuccess: (data: AnalysisResult) => void;
  onError: (message: string) => void;
  previewUrl: string;
}

export default function UploadZone({ onSubmit, onSuccess, onError, previewUrl }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (file: File) => {
    if (!file || !SUPPORTED_TYPES.includes(file.type)) return;
    setUploading(true);
    const previewUrl = URL.createObjectURL(file);
    onSubmit(previewUrl);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await axios.post('http://localhost:8000/analyze', formData, {
        timeout: 60000,
      });
      onSuccess(data);
    } catch (error: any) {
      const message =
        error?.response?.data?.detail ||
        error?.message ||
        'Upload failed. Please try again.';
      onError(message);
    } finally {
      setUploading(false);
    }
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) uploadFile(file);
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const fileFromList = Array.from(event.clipboardData.files).find((file) =>
      SUPPORTED_TYPES.includes(file.type)
    );
    const fileFromItems = Array.from(event.clipboardData.items)
      .find((item) => item.kind === 'file' && SUPPORTED_TYPES.includes(item.type))
      ?.getAsFile();
    const file = fileFromList || fileFromItems;

    if (!file) {
      onError('Paste an image in JPG, PNG, or WEBP format.');
      return;
    }

    event.preventDefault();
    void uploadFile(file);
  };

  if (uploading) {
    return (
      <div style={{
        border: '1px solid var(--line-strong)',
        padding: '40px 20px',
        textAlign: 'center',
        background: 'var(--paper)',
      }}>
        <div className="animate-spin" style={{
          width: 32, height: 32, border: '3px solid var(--accent-border)', borderTopColor: 'var(--accent)',
          borderRadius: '50%', margin: '0 auto 16px',
        }} />
        <p className="font-mono" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Analyzing specimen...
        </p>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp"
        onChange={onInputChange}
      />

      <div style={{
        border: `1.5px dashed ${dragActive ? 'var(--accent)' : 'var(--line-strong)'}`,
        padding: '36px 20px',
        textAlign: 'center',
        background: dragActive ? 'var(--accent-soft)' : 'var(--paper)',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease, background 0.15s ease',
        marginBottom: 20,
      }}
        ref={dropzoneRef}
        tabIndex={0}
        role="button"
        aria-label="Upload, paste, or drag and drop a plant image"
        onClick={() => {
          dropzoneRef.current?.focus();
          inputRef.current?.click();
        }}
        onPaste={onPaste}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
      >
        <div style={{
          width: 44, height: 44, background: 'var(--surface)', border: '1px solid var(--line-strong)',
          margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v14M12 3l-5 5M12 3l5 5" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 19h16" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text)' }}>
          <strong style={{ color: 'var(--accent-hover)', fontWeight: 600 }}>Click to upload</strong>, paste, or drag &amp; drop
        </p>
        <p className="font-mono" style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6, letterSpacing: '0.03em' }}>JPG · PNG · WEBP — UP TO 10MB</p>
      </div>
    </>
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
