import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronUp, Copy, Pencil, X } from 'lucide-react';
import type { ActionLogEntry, FormRequest, ImportPreviewResult } from '@ai-assistant/core';
import type { WidgetMessage } from '../hooks/useChatStream.ts';
import { ConfirmCard } from './ConfirmCard.tsx';
import { HumanInLoopFormCard } from './HumanInLoopFormCard.tsx';
import { ImportPreview } from './ImportPreview.tsx';

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div
      style={{
        margin: '8px 0',
        borderRadius: '12px',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        background: '#0f172a',
        color: '#e2e8f0',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: '#1e293b',
          fontSize: '11px',
          color: '#94a3b8',
          fontFamily: 'var(--aia-font-mono)',
        }}
      >
        <span>{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code block"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'transparent',
            border: 'none',
            color: '#e2e8f0',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: '10px 12px',
          overflowX: 'auto',
          fontSize: '12px',
          lineHeight: 1.5,
          fontFamily: 'var(--aia-font-mono)',
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          style={{
            padding: '1px 6px',
            borderRadius: '6px',
            background: 'var(--aia-inset)',
            border: '1px solid var(--aia-hairline)',
            fontFamily: 'var(--aia-font-mono)',
            fontSize: '0.86em',
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function MarkdownContent({ text }: { text: string }) {
  const blocks = text.split(/(```[\s\S]*?```)/g);

  return (
    <div style={{ fontSize: '13.5px', lineHeight: 1.6, wordBreak: 'break-word' }}>
      {blocks.map((block, bIdx) => {
        if (block.startsWith('```') && block.endsWith('```')) {
          const lines = block.slice(3, -3).split('\n');
          const lang = lines[0]?.trim() || '';
          const code = lines.slice(1).join('\n');
          return <CodeBlock key={bIdx} lang={lang} code={code} />;
        }

        const lines = block.split('\n');
        return (
          <div key={bIdx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lIdx} style={{ height: '4px' }} />;
              if (trimmed.startsWith('Source:')) {
                return (
                  <div
                    key={lIdx}
                    style={{
                      marginTop: '6px',
                      paddingTop: '6px',
                      borderTop: '1px solid var(--aia-hairline)',
                      fontSize: '12px',
                      color: 'var(--aia-text-muted)',
                    }}
                  >
                    {renderInlineFormatting(trimmed)}
                  </div>
                );
              }
              if (/^#{1,3}\s+/.test(trimmed)) {
                return (
                  <div key={lIdx} style={{ fontWeight: 700, fontFamily: 'var(--aia-font-display)', marginTop: '4px' }}>
                    {renderInlineFormatting(trimmed.replace(/^#{1,3}\s+/, ''))}
                  </div>
                );
              }
              if (/^(\d+\.|-|\*)\s+/.test(trimmed)) {
                return (
                  <div key={lIdx} style={{ paddingLeft: '10px' }}>
                    {renderInlineFormatting(trimmed)}
                  </div>
                );
              }
              return <div key={lIdx}>{renderInlineFormatting(trimmed)}</div>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export interface MessageListProps {
  messages: WidgetMessage[];
  suggestions?: string[];
  mobileCompactMode?: boolean;
  onExpandMobileHistory?: () => void;
  onSuggestionClick?: (text: string) => void;
  onSubmitForm?: (
    messageId: string,
    form: FormRequest,
    values: Record<string, string | number | boolean>
  ) => void;
  onCancelForm?: (messageId: string) => void;
  onConfirmAction: (
    messageId: string,
    actionId: string,
    confirmationToken: string,
    decision: 'confirm' | 'cancel'
  ) => void;
  onUndoAction: (messageId: string, actionId: string) => Promise<{ ok: boolean; summary?: string }>;
  onConfirmImport: (
    messageId: string,
    preview: ImportPreviewResult,
    decision: 'confirm' | 'cancel'
  ) => Promise<{ ok: boolean; summary?: string }>;
  onDownloadErrorCsv: (uploadId: string) => void;
  onEditMessage?: (messageId: string, nextText: string) => void;
  onActionCompleted?: (action: ActionLogEntry) => void;
}

export function MessageList({
  messages,
  suggestions = [
    'Download Class Report PDF',
    'Add student',
    'Open Admin demo dashboard',
  ],
  mobileCompactMode = false,
  onExpandMobileHistory,
  onSuggestionClick,
  onSubmitForm,
  onCancelForm,
  onConfirmAction,
  onUndoAction,
  onConfirmImport,
  onDownloadErrorCsv,
  onEditMessage,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, mobileCompactMode]);

  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: mobileCompactMode ? '12px 14px' : '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: mobileCompactMode ? 'flex-start' : 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '1rem',
            background: 'var(--aia-inset)',
            border: '1px solid var(--aia-hairline)',
          }}
        >
          <div
            style={{
              fontSize: '10.5px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
              color: 'var(--aia-primary)',
              marginBottom: '4px',
            }}
          >
            Ready to assist
          </div>
          <h3
            style={{
              margin: '0 0 4px 0',
              fontSize: '15.5px',
              fontWeight: 700,
              fontFamily: 'var(--aia-font-display)',
              color: 'var(--aia-text)',
            }}
          >
            Ask or act across Khazna
          </h3>
          <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--aia-text-muted)', lineHeight: 1.5 }}>
            Tap the mic to speak, use + to pick a cuboid or attach a file, or issue any single-prompt command or download.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {(mobileCompactMode ? suggestions.slice(0, 2) : suggestions).map((s) => (
            <button
              key={s}
              type="button"
              className="aia-suggestion-btn"
              onClick={() => onSuggestionClick?.(s)}
            >
              <span>{s}</span>
              <ArrowUpRight size={14} style={{ color: 'var(--aia-primary)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // On mobile "Hey Google" compact mode, display only the latest exchange
  let visibleMessages = messages;
  let hiddenCount = 0;
  if (mobileCompactMode && messages.length > 0) {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    const startIdx = lastUserIdx >= 0 ? lastUserIdx : Math.max(0, messages.length - 1);
    visibleMessages = messages.slice(startIdx);
    hiddenCount = startIdx;
  }

  return (
    <div
      data-testid="assistant-messages"
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: mobileCompactMode ? '12px 14px' : '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {mobileCompactMode && hiddenCount > 0 && onExpandMobileHistory && (
        <button
          type="button"
          data-testid="mobile-expand-history-btn"
          onClick={onExpandMobileHistory}
          style={{
            alignSelf: 'center',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 11px',
            borderRadius: '0.75rem',
            border: '1px solid var(--aia-hairline)',
            background: 'var(--aia-inset)',
            color: 'var(--aia-text-muted)',
            fontSize: '11.5px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <ChevronUp size={13} />
          Swipe up for {hiddenCount} earlier message(s)
        </button>
      )}

      {visibleMessages.map((msg) => {
        const isUser = msg.role === 'user';
        const attachedContexts =
          msg.contexts && msg.contexts.length > 0
            ? msg.contexts
            : msg.context
              ? [msg.context]
              : [];
        const isEditingThis = isUser && editingMsgId === msg.id;

        return (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: isUser ? 'flex-end' : 'flex-start',
              gap: '6px',
            }}
          >
            {attachedContexts.length > 0 && (
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                {attachedContexts.map((ctx, cIdx) => (
                  <div
                    key={`${ctx.cssSelector || cIdx}`}
                    style={{
                      fontSize: '11px',
                      fontFamily: 'var(--aia-font-mono)',
                      color: 'var(--aia-subtle)',
                      padding: '2px 8px',
                      borderRadius: '0.5rem',
                      background: 'var(--aia-inset)',
                      border: '1px solid var(--aia-hairline)',
                    }}
                  >
                    Selected card:{' '}
                    {ctx.nearbyLabel ||
                      (ctx.text ? ctx.text.replace(/\s+/g, ' ').trim().slice(0, 36) : undefined) ||
                      ctx.routePath}
                  </div>
                ))}
              </div>
            )}

            {msg.attachments && msg.attachments.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {msg.attachments.map((att, idx) =>
                  att.type === 'image' && att.dataUrl ? (
                    <img
                      key={idx}
                      src={att.dataUrl}
                      alt={att.name}
                      style={{
                        maxWidth: '180px',
                        maxHeight: '110px',
                        borderRadius: '0.75rem',
                        border: '1px solid var(--aia-hairline)',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div
                      key={idx}
                      style={{
                        fontSize: '12px',
                        color: 'var(--aia-text)',
                        background: 'var(--aia-surface)',
                        border: '1px solid var(--aia-hairline)',
                        borderRadius: '0.65rem',
                        padding: '4px 8px',
                      }}
                    >
                      {att.name}
                    </div>
                  )
                )}
              </div>
            )}

            <div
              style={{
                maxWidth: '94%',
                padding: '11px 14px',
                borderRadius: isUser ? '1rem 1rem 0.35rem 1rem' : '1rem 1rem 1rem 0.35rem',
                background: isUser ? 'var(--aia-gradient-primary)' : 'var(--aia-surface)',
                color: isUser ? 'var(--aia-primary-fg)' : 'var(--aia-text)',
                border: isUser ? '1px solid transparent' : '1px solid var(--aia-hairline)',
                boxShadow: isUser ? 'var(--aia-shadow-glow)' : 'inset 0 1px 0 rgba(255, 255, 255, 0.2)',
              }}
            >
              {isUser ? (
                isEditingThis ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '210px' }}>
                    <textarea
                      aria-label="Edit message text"
                      rows={2}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      style={{
                        width: '100%',
                        borderRadius: '0.55rem',
                        border: '1px solid rgba(255,255,255,0.4)',
                        background: 'rgba(15, 23, 42, 0.22)',
                        color: '#ffffff',
                        padding: '6px 8px',
                        fontSize: '13px',
                        fontFamily: 'inherit',
                        outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMsgId(null);
                          setEditingText('');
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          padding: '3px 8px',
                          borderRadius: '0.5rem',
                          border: '1px solid rgba(255,255,255,0.35)',
                          background: 'transparent',
                          color: '#ffffff',
                          fontSize: '11.5px',
                          cursor: 'pointer',
                        }}
                      >
                        <X size={12} />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = editingText.trim();
                          setEditingMsgId(null);
                          setEditingText('');
                          if (next && onEditMessage) onEditMessage(msg.id, next);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          padding: '3px 9px',
                          borderRadius: '0.5rem',
                          border: 'none',
                          background: '#ffffff',
                          color: '#0f172a',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <Check size={12} />
                        Resend
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ fontSize: '13.5px', lineHeight: 1.5, whiteSpace: 'pre-wrap', fontWeight: 500 }}>
                      {msg.content}
                    </div>
                    {onEditMessage && !mobileCompactMode && (
                      <button
                        type="button"
                        aria-label="Edit and resend message"
                        title="Edit & resend"
                        onClick={() => {
                          setEditingMsgId(msg.id);
                          setEditingText(msg.content);
                        }}
                        style={{
                          border: 'none',
                          background: 'rgba(255,255,255,0.16)',
                          color: 'var(--aia-primary-fg)',
                          borderRadius: '0.45rem',
                          padding: '3px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          flexShrink: 0,
                          opacity: 0.85,
                        }}
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>
                )
              ) : (
                <>
                  {msg.isStreaming && msg.statusLabel && (
                    <div
                      data-testid="agent-status-phase"
                      style={{
                        marginBottom: '6px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        color: 'var(--aia-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>{msg.statusLabel}</span>
                    </div>
                  )}

                  {msg.toolEvents && msg.toolEvents.length > 0 && (
                    <div
                      style={{
                        marginBottom: '8px',
                        fontSize: '11.5px',
                        fontFamily: 'var(--aia-font-mono)',
                        color: 'var(--aia-text-muted)',
                        borderBottom: '1px solid var(--aia-hairline)',
                        paddingBottom: '6px',
                      }}
                    >
                      {msg.toolEvents.map((t, idx) => (
                        <div key={idx}>
                          Action: <strong>{t.toolName}</strong> — {t.status}
                          {t.status === 'failed' && t.summary ? ` (${t.summary})` : ''}
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.content ? (
                    <MarkdownContent text={msg.content} />
                  ) : msg.isStreaming ? (
                    <span style={{ fontSize: '13px', color: 'var(--aia-subtle)' }}>
                      {msg.statusLabel || 'Thinking…'}
                    </span>
                  ) : null}
                </>
              )}
            </div>

            {!isUser && !msg.isStreaming && msg.followUpChips && msg.followUpChips.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: '6px',
                  flexWrap: 'wrap',
                  marginTop: '4px',
                  maxWidth: '94%',
                }}
              >
                {msg.followUpChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => onSuggestionClick?.(chip.prompt)}
                    style={{
                      border: '1px solid var(--aia-hairline)',
                      background: 'var(--aia-inset)',
                      borderRadius: '0.65rem',
                      padding: '4px 10px',
                      fontSize: '11.5px',
                      fontWeight: 500,
                      color: 'var(--aia-primary)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>{chip.label}</span>
                    <ArrowUpRight size={11} />
                  </button>
                ))}
              </div>
            )}

            {msg.formRequest && onSubmitForm && onCancelForm && (
              <div style={{ width: '100%' }}>
                <HumanInLoopFormCard
                  form={msg.formRequest}
                  status={msg.formStatus || 'pending'}
                  submittedValues={msg.formValues}
                  onSubmit={(values) => onSubmitForm(msg.id, msg.formRequest!, values)}
                  onCancel={() => onCancelForm(msg.id)}
                />
              </div>
            )}

            {msg.confirmation && (
              <div style={{ width: '100%' }}>
                <ConfirmCard
                  confirmation={msg.confirmation}
                  onConfirm={() =>
                    onConfirmAction(
                      msg.id,
                      msg.confirmation!.actionId,
                      msg.confirmation!.confirmationToken,
                      'confirm'
                    )
                  }
                  onCancel={() =>
                    onConfirmAction(
                      msg.id,
                      msg.confirmation!.actionId,
                      msg.confirmation!.confirmationToken,
                      'cancel'
                    )
                  }
                  onUndo={() => onUndoAction(msg.id, msg.confirmation!.actionId)}
                />
              </div>
            )}

            {msg.importPreview && (
              <div style={{ width: '100%' }}>
                <ImportPreview
                  preview={msg.importPreview}
                  onConfirm={() => onConfirmImport(msg.id, msg.importPreview!, 'confirm')}
                  onCancel={() => onConfirmImport(msg.id, msg.importPreview!, 'cancel')}
                  onUndo={
                    msg.importPreview.actionId
                      ? () => onUndoAction(msg.id, msg.importPreview!.actionId!)
                      : undefined
                  }
                  onDownloadErrorCsv={() => onDownloadErrorCsv(msg.importPreview!.uploadId)}
                />
              </div>
            )}
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}
