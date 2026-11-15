import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Layers, Mic, MicOff, Paperclip, Plus, Send, Sparkles, X } from 'lucide-react';
import type { ChatAttachment, RightClickContext } from '@ai-assistant/core';

export interface ComposerProps {
  disabled?: boolean;
  apiUrl?: string;
  appId?: string;
  defaultLanguage?: 'auto' | 'en' | 'ml';
  voiceAutoSend?: boolean;
  pendingContext?: RightClickContext | null;
  pendingContexts?: RightClickContext[];
  onClearContext?: () => void;
  onRemoveContext?: (index: number) => void;
  onAskAboutContext?: (context: RightClickContext) => void;
  onAskAboutContexts?: (contexts: RightClickContext[]) => void;
  onToggleInspect?: () => void;
  onSend: (params: {
    text: string;
    attachments?: ChatAttachment[];
    language?: string;
  }) => void;
  onUploadSpreadsheet: (
    file: File,
    targetArea?: 'auto' | 'students' | 'managers' | 'bulk-entries'
  ) => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function Composer({
  disabled = false,
  apiUrl = '',
  appId = 'khazna-ledger',
  defaultLanguage = 'auto',
  voiceAutoSend = false,
  pendingContext,
  pendingContexts,
  onClearContext,
  onRemoveContext,
  onAskAboutContext,
  onAskAboutContexts,
  onToggleInspect,
  onSend,
  onUploadSpreadsheet,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<'auto' | 'en' | 'ml'>(defaultLanguage);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [plusOpen, setPlusOpen] = useState(false);
  const [uploadTargetArea, setUploadTargetArea] = useState<'auto' | 'students' | 'managers' | 'bulk-entries'>('auto');
  const [recordingState, setRecordingState] = useState<'idle' | 'listening' | 'transcribing'>('idle');
  const [micError, setMicError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const plusContainerRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setLanguage(defaultLanguage);
  }, [defaultLanguage]);

  // Close + popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!plusOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (plusContainerRef.current && !plusContainerRef.current.contains(e.target as Node)) {
        setPlusOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlusOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [plusOpen]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
        onUploadSpreadsheet(file, uploadTargetArea);
        return;
      }
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            setAttachments((prev) => [
              ...prev,
              {
                type: 'image',
                name: file.name || 'screenshot.png',
                mimeType: file.type,
                dataUrl: reader.result as string,
              },
            ]);
          }
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              setAttachments((prev) => [
                ...prev,
                {
                  type: 'image',
                  name: 'pasted-screenshot.png',
                  mimeType: file.type,
                  dataUrl: reader.result as string,
                },
              ]);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const applyTranscript = (transcript: string) => {
    const clean = transcript.trim();
    if (!clean) return;
    if (voiceAutoSend) {
      onSend({
        text: clean,
        attachments: attachments.length > 0 ? attachments : undefined,
        language: language === 'auto' ? undefined : language,
      });
      setText('');
      setAttachments([]);
    } else {
      setText((prev) => (prev.trim() ? `${prev.trim()} ${clean}` : clean));
    }
  };

  const startMediaRecorder = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicError('Microphone recording is not supported in this browser.');
      setRecordingState('idle');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) mediaChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(mediaChunksRef.current, { type: mimeType });
        if (blob.size === 0) {
          setRecordingState('idle');
          return;
        }
        setRecordingState('transcribing');
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const dataUrl = String(reader.result || '');
            const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
            const baseUrl = apiUrl.replace(/\/$/, '');
            const res = await fetch(`${baseUrl}/api/transcribe`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-app-id': appId,
              },
              body: JSON.stringify({
                audioBase64: base64,
                mimeType,
                language: language === 'auto' ? undefined : language,
              }),
            });
            const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
            if (!res.ok) {
              throw new Error(json.error || `Transcription failed (${res.status})`);
            }
            if (json.text) {
              applyTranscript(json.text);
            } else {
              setMicError('No speech detected. Try again.');
            }
          } catch (err) {
            setMicError(err instanceof Error ? err.message : 'Voice transcription failed.');
          } finally {
            setRecordingState('idle');
            mediaRecorderRef.current = null;
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingState('listening');
    } catch {
      setMicError('Microphone permission denied or unavailable.');
      setRecordingState('idle');
    }
  };

  const toggleVoiceInput = () => {
    setMicError(null);

    if (recordingState === 'listening') {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      } else {
        setRecordingState('idle');
      }
      return;
    }

    if (recordingState === 'transcribing') return;

    const SpeechCtor =
      typeof window !== 'undefined'
        ? ((window as unknown as Record<string, unknown>).SpeechRecognition ||
            (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
        : undefined;

    if (typeof SpeechCtor === 'function') {
      try {
        const rec = new (SpeechCtor as new () => SpeechRecognitionInstance)();
        rec.lang = language === 'ml' ? 'ml-IN' : 'en-IN';
        rec.continuous = false;
        rec.interimResults = false;

        let captured = false;
        rec.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((r) => r[0]?.transcript || '')
            .join(' ')
            .trim();
          if (transcript) {
            captured = true;
            applyTranscript(transcript);
          }
        };
        rec.onerror = (ev) => {
          recognitionRef.current = null;
          if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') {
            setMicError('Microphone permission denied.');
            setRecordingState('idle');
            return;
          }
          // Fall back to server audio transcription if browser SpeechRecognition fails
          void startMediaRecorder();
        };
        rec.onend = () => {
          recognitionRef.current = null;
          if (captured || mediaRecorderRef.current) {
            setRecordingState((cur) => (cur === 'listening' && !mediaRecorderRef.current ? 'idle' : cur));
          } else {
            setRecordingState('idle');
          }
        };

        recognitionRef.current = rec;
        setRecordingState('listening');
        rec.start();
        return;
      } catch {
        recognitionRef.current = null;
      }
    }

    void startMediaRecorder();
  };

  const submit = () => {
    if (disabled) return;
    if (!text.trim() && attachments.length === 0) return;
    onSend({
      text,
      attachments: attachments.length > 0 ? attachments : undefined,
      language: language === 'auto' ? undefined : language,
    });
    setText('');
    setAttachments([]);
  };

  const canSend = !disabled && (text.trim().length > 0 || attachments.length > 0);
  const attachedContexts =
    pendingContexts && pendingContexts.length > 0
      ? pendingContexts
      : pendingContext
        ? [pendingContext]
        : [];

  return (
    <div
      style={{
        padding: '10px 14px 14px',
        borderTop: '1px solid var(--aia-hairline)',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        position: 'relative',
      }}
    >
      {/* Accessory View for selected parent cuboid(s) */}
      {attachedContexts.length > 0 && (
        <div
          data-testid="accessory-context-card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: '8px 10px',
            borderRadius: '0.85rem',
            background: 'color-mix(in oklab, var(--aia-primary) 9%, var(--aia-surface))',
            border: '1px solid color-mix(in oklab, var(--aia-primary) 32%, var(--aia-hairline))',
            fontSize: '12px',
            color: 'var(--aia-text)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '11.5px', color: 'var(--aia-primary)' }}>
              <Layers size={14} style={{ flexShrink: 0 }} />
              <span>
                {attachedContexts.length === 1
                  ? 'Selected Card'
                  : `${attachedContexts.length} Selected Cards`}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {(onAskAboutContexts || onAskAboutContext) && (
                <button
                  type="button"
                  onClick={() => {
                    if (onAskAboutContexts) onAskAboutContexts(attachedContexts);
                    else if (onAskAboutContext) onAskAboutContext(attachedContexts[0]);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    borderRadius: '0.55rem',
                    border: '1px solid color-mix(in oklab, var(--aia-primary) 35%, transparent)',
                    background: 'var(--aia-surface-strong)',
                    color: 'var(--aia-primary)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Sparkles size={11} />
                  {attachedContexts.length > 1 ? 'Explain selected cards' : 'Explain what this shows'}
                </button>
              )}
              {onClearContext && (
                <button
                  type="button"
                  onClick={onClearContext}
                  aria-label="Clear all attached cuboid contexts"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--aia-text-muted)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'inline-flex',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {attachedContexts.map((ctx, idx) => {
              const ctxLabel =
                ctx.nearbyLabel ||
                (ctx.text ? ctx.text.replace(/\s+/g, ' ').trim().slice(0, 48) : undefined) ||
                ctx.tag ||
                'Card';
              return (
                <div
                  key={`${ctx.cssSelector || idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    padding: '5px 8px',
                    borderRadius: '0.6rem',
                    background: 'var(--aia-surface-strong)',
                    border: '1px solid var(--aia-hairline)',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '11.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ctxLabel}
                    </div>
                    {ctx.text && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--aia-text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ctx.text.replace(/\s+/g, ' ').trim().slice(0, 80)}
                      </div>
                    )}
                  </div>
                  {(onRemoveContext || onClearContext) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onRemoveContext) onRemoveContext(idx);
                        else onClearContext?.();
                      }}
                      aria-label={`Remove attached cuboid ${ctxLabel}`}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--aia-text-muted)',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'inline-flex',
                        flexShrink: 0,
                      }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {attachments.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {attachments.map((att, idx) => (
            <div
              key={idx}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 9px',
                borderRadius: '0.65rem',
                border: '1px solid var(--aia-hairline)',
                background: 'var(--aia-surface)',
                color: 'var(--aia-text)',
                fontSize: '12px',
              }}
            >
              <span>{att.name}</span>
              <button
                type="button"
                aria-label={`Remove ${att.name}`}
                onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--aia-text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {micError && (
        <div role="status" style={{ fontSize: '11.5px', color: 'var(--aia-debit)' }}>
          {micError}
        </div>
      )}

      {recordingState !== 'idle' && (
        <div
          role="status"
          style={{
            fontSize: '11.5px',
            fontWeight: 600,
            color: 'var(--aia-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>{recordingState === 'listening' ? 'Listening… tap mic to stop' : 'Transcribing voice…'}</span>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--aia-hairline)',
          borderRadius: '1rem',
          background: 'var(--aia-surface)',
          padding: '9px 11px',
          gap: '8px',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.25)',
        }}
      >
        <textarea
          aria-label="Ask the assistant a question"
          placeholder={
            attachedContexts.length > 0
              ? 'Ask about the attached card(s) or command Khazna...'
              : 'Ask Khazna AI, command a download, or use + / mic...'
          }
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontSize: '13.5px',
            lineHeight: 1.5,
            fontFamily: 'inherit',
            color: 'var(--aia-text)',
            background: 'transparent',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div ref={plusContainerRef} style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Upload screenshot or spreadsheet"
              accept=".png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              data-testid="composer-plus-btn"
              aria-expanded={plusOpen}
              aria-haspopup="menu"
              aria-label="Add attachment or select card with cursor"
              title="Attach file or select card with cursor"
              onClick={() => setPlusOpen((v) => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '0.65rem',
                border: '1px solid var(--aia-hairline)',
                background: plusOpen ? 'color-mix(in oklab, var(--aia-primary) 16%, transparent)' : 'var(--aia-inset)',
                color: plusOpen ? 'var(--aia-primary)' : 'var(--aia-text-muted)',
                cursor: 'pointer',
              }}
            >
              <Plus size={16} />
            </button>

            {plusOpen && (
              <div
                role="menu"
                data-testid="composer-plus-menu"
                className="aia-ctx-menu"
                style={{
                  position: 'absolute',
                  bottom: '40px',
                  left: 0,
                  minWidth: '250px',
                }}
              >
                <div style={{ padding: '4px 8px 6px', borderBottom: '1px solid var(--aia-hairline)', marginBottom: '4px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      color: 'var(--aia-subtle)',
                      marginBottom: '4px',
                    }}
                  >
                    CSV Target Area
                  </label>
                  <select
                    aria-label="CSV upload target area"
                    data-testid="csv-target-area-select"
                    value={uploadTargetArea}
                    onChange={(e) =>
                      setUploadTargetArea(
                        e.target.value as 'auto' | 'students' | 'managers' | 'bulk-entries'
                      )
                    }
                    style={{
                      width: '100%',
                      height: '28px',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--aia-hairline)',
                      background: 'var(--aia-inset)',
                      color: 'var(--aia-text)',
                      fontSize: '11.5px',
                      padding: '0 6px',
                    }}
                  >
                    <option value="auto">Auto-detect CSV format</option>
                    <option value="students">Students Directory</option>
                    <option value="managers">Sector Managers</option>
                    <option value="bulk-entries">Bulk Ledger Entries</option>
                  </select>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="plus-attach-file"
                  className="aia-ctx-btn"
                  onClick={() => {
                    setPlusOpen(false);
                    fileInputRef.current?.click();
                  }}
                >
                  <Paperclip size={14} />
                  <span>Attach screenshot / CSV / Excel</span>
                </button>
                {onToggleInspect && (
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="plus-cursor-inspect"
                    className="aia-ctx-btn"
                    onClick={() => {
                      setPlusOpen(false);
                      onToggleInspect();
                    }}
                  >
                    <Crosshair size={14} />
                    <span>Select cuboid with cursor</span>
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              data-testid="composer-mic-btn"
              aria-pressed={recordingState !== 'idle'}
              aria-label={recordingState === 'listening' ? 'Stop voice recording' : 'Voice input'}
              title="Voice input (English & Malayalam)"
              onClick={toggleVoiceInput}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '0.65rem',
                border: '1px solid var(--aia-hairline)',
                background:
                  recordingState === 'listening'
                    ? 'color-mix(in oklab, var(--aia-debit) 18%, transparent)'
                    : 'var(--aia-inset)',
                color: recordingState === 'listening' ? 'var(--aia-debit)' : 'var(--aia-text-muted)',
                cursor: 'pointer',
              }}
            >
              {recordingState === 'listening' ? <MicOff size={15} /> : <Mic size={15} />}
            </button>

            <select
              aria-label="Response language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'auto' | 'en' | 'ml')}
              style={{
                height: '32px',
                borderRadius: '0.65rem',
                border: '1px solid var(--aia-hairline)',
                background: 'var(--aia-inset)',
                color: 'var(--aia-text-muted)',
                fontSize: '12px',
                padding: '0 8px',
                outline: 'none',
              }}
            >
              <option value="auto">Auto (EN / ML)</option>
              <option value="en">English</option>
              <option value="ml">മലയാളം</option>
            </select>
          </div>

          <button
            type="button"
            disabled={!canSend}
            onClick={submit}
            aria-label="Send message"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '0.75rem',
              border: 'none',
              background: 'var(--aia-gradient-primary)',
              color: 'var(--aia-primary-fg)',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: canSend ? 'var(--aia-shadow-glow)' : 'none',
              cursor: canSend ? 'pointer' : 'not-allowed',
              opacity: canSend ? 1 : 0.45,
            }}
          >
            <Send size={14} />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
