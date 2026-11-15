import React, { useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import type { ImportPreviewResult } from '@ai-assistant/core';

export interface ImportPreviewProps {
  preview: ImportPreviewResult;
  onConfirm: () => Promise<{ ok: boolean; summary?: string }>;
  onCancel: () => Promise<{ ok: boolean; summary?: string }>;
  onUndo?: () => Promise<{ ok: boolean; summary?: string }>;
  onDownloadErrorCsv: () => void;
}

export function ImportPreview({
  preview,
  onConfirm,
  onCancel,
  onUndo,
  onDownloadErrorCsv,
}: ImportPreviewProps) {
  const [tab, setTab] = useState<'valid' | 'errors'>(
    preview.invalidCount > 0 && preview.validCount === 0 ? 'errors' : 'valid'
  );
  const [status, setStatus] = useState<'pending' | 'submitting' | 'executed' | 'cancelled' | 'undone'>('pending');
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleConfirm = async () => {
    setStatus('submitting');
    const res = await onConfirm();
    setFeedback(res.summary || (res.ok ? 'Import completed.' : 'Import failed.'));
    setStatus(res.ok ? 'executed' : 'pending');
  };

  const handleCancel = async () => {
    const res = await onCancel();
    setFeedback(res.summary || 'Import cancelled.');
    setStatus('cancelled');
  };

  const handleUndo = async () => {
    if (!onUndo) return;
    const res = await onUndo();
    setFeedback(res.summary || 'Import undone.');
    if (res.ok) setStatus('undone');
  };

  const cols = preview.columnMapping.map((m) => m.expectedKey);

  return (
    <div
      data-testid="import-preview-card"
      style={{
        borderRadius: '1rem',
        border: '1px solid var(--aia-hairline)',
        background: 'var(--aia-surface)',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 700,
            fontFamily: 'var(--aia-font-display)',
            color: 'var(--aia-text)',
          }}
        >
          Import Preview: {preview.fileName}
        </div>
        <div
          style={{
            fontSize: '12px',
            fontFamily: 'var(--aia-font-mono)',
            fontVariantNumeric: 'tabular-nums',
            color: preview.formatMatched === false ? 'var(--aia-debit)' : 'var(--aia-text-muted)',
          }}
        >
          {preview.validCount} valid / {preview.invalidCount} errors
          {(preview.duplicateCount || 0) > 0 ? ` (${preview.duplicateCount} dup)` : ''}
        </div>
      </div>

      {preview.permissionError ? (
        <div
          data-testid="import-permission-error"
          role="alert"
          style={{
            padding: '8px 10px',
            borderRadius: '0.75rem',
            border: '1px solid color-mix(in oklab, var(--aia-debit) 35%, transparent)',
            background: 'color-mix(in oklab, var(--aia-debit) 10%, transparent)',
            color: 'var(--aia-debit)',
            fontSize: '12px',
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          {preview.permissionError}
        </div>
      ) : preview.formatMatched === false ? (
        <div
          data-testid="import-format-error"
          role="alert"
          style={{
            padding: '8px 10px',
            borderRadius: '0.75rem',
            border: '1px solid color-mix(in oklab, var(--aia-debit) 35%, transparent)',
            background: 'color-mix(in oklab, var(--aia-debit) 10%, transparent)',
            color: 'var(--aia-debit)',
            fontSize: '12px',
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          Format verification failed for target template <code>{preview.templateId}</code>.
          {preview.missingRequiredColumns && preview.missingRequiredColumns.length > 0
            ? ` Missing required columns: ${preview.missingRequiredColumns.join(', ')}.`
            : ' No valid rows matched this format.'}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--aia-hairline)', paddingBottom: '8px' }}>
        <button
          type="button"
          onClick={() => setTab('valid')}
          style={{
            padding: '5px 10px',
            borderRadius: '0.65rem',
            border: '1px solid',
            borderColor: tab === 'valid' ? 'transparent' : 'var(--aia-hairline)',
            background: tab === 'valid' ? 'var(--aia-gradient-primary)' : 'var(--aia-inset)',
            color: tab === 'valid' ? 'var(--aia-primary-fg)' : 'var(--aia-text-muted)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Valid Rows ({preview.validCount})
        </button>
        <button
          type="button"
          onClick={() => setTab('errors')}
          style={{
            padding: '5px 10px',
            borderRadius: '0.65rem',
            border: '1px solid',
            borderColor: tab === 'errors' ? 'transparent' : 'var(--aia-hairline)',
            background: tab === 'errors' ? 'var(--aia-debit)' : 'var(--aia-inset)',
            color: tab === 'errors' ? '#ffffff' : 'var(--aia-text-muted)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Error Rows ({preview.invalidCount})
        </button>
      </div>

      {tab === 'valid' ? (
        <div style={{ maxHeight: '180px', overflow: 'auto', border: '1px solid var(--aia-hairline)', borderRadius: '0.75rem' }}>
          {preview.validRows.length === 0 ? (
            <div style={{ padding: '12px', fontSize: '12.5px', color: 'var(--aia-subtle)' }}>
              No valid rows found in this file.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: 'var(--aia-text)' }}>
              <thead>
                <tr style={{ background: 'var(--aia-inset)', textAlign: 'left', color: 'var(--aia-text-muted)' }}>
                  <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--aia-hairline)' }}>Row</th>
                  {cols.slice(0, 4).map((c) => (
                    <th key={c} style={{ padding: '6px 8px', borderBottom: '1px solid var(--aia-hairline)' }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.validRows.slice(0, 20).map((r) => (
                  <tr key={r.rowNumber}>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--aia-hairline)', fontFamily: 'var(--aia-font-mono)' }}>
                      {r.rowNumber}
                    </td>
                    {cols.slice(0, 4).map((c) => (
                      <td key={c} style={{ padding: '5px 8px', borderBottom: '1px solid var(--aia-hairline)' }}>
                        {String(r.data[c] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div
          style={{
            maxHeight: '180px',
            overflow: 'auto',
            border: '1px solid color-mix(in oklab, var(--aia-debit) 30%, transparent)',
            borderRadius: '0.75rem',
          }}
        >
          {preview.errors.length === 0 ? (
            <div style={{ padding: '12px', fontSize: '12.5px', color: 'var(--aia-credit)' }}>
              All rows passed validation with zero errors.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr
                  style={{
                    background: 'color-mix(in oklab, var(--aia-debit) 10%, transparent)',
                    textAlign: 'left',
                    color: 'var(--aia-debit)',
                  }}
                >
                  <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--aia-hairline)' }}>Row</th>
                  <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--aia-hairline)' }}>Reasons</th>
                </tr>
              </thead>
              <tbody>
                {preview.errors.map((err) => (
                  <tr key={err.rowNumber}>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--aia-hairline)', fontFamily: 'var(--aia-font-mono)', color: 'var(--aia-text)' }}>
                      {err.rowNumber}
                    </td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--aia-hairline)', color: 'var(--aia-debit)' }}>
                      {err.reasons.join('; ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {feedback && (
        <div style={{ fontSize: '12.5px', fontWeight: 600, color: status === 'executed' ? 'var(--aia-credit)' : 'var(--aia-text-muted)' }}>
          {feedback.replace(/\*\*/g, '')}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {status === 'pending' && preview.formatMatched !== false && preview.validCount > 0 && (
            <>
              <button
                type="button"
                onClick={handleConfirm}
                style={{
                  padding: '7px 14px',
                  borderRadius: '0.75rem',
                  border: 'none',
                  background: 'var(--aia-gradient-primary)',
                  color: 'var(--aia-primary-fg)',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  boxShadow: 'var(--aia-shadow-glow)',
                  cursor: 'pointer',
                }}
              >
                Confirm Import ({preview.validCount})
              </button>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  padding: '7px 12px',
                  borderRadius: '0.75rem',
                  border: '1px solid var(--aia-hairline)',
                  background: 'var(--aia-inset)',
                  color: 'var(--aia-text)',
                  fontSize: '12.5px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </>
          )}
          {status === 'submitting' && (
            <span style={{ fontSize: '12.5px', color: 'var(--aia-text-muted)' }}>
              Verifying &amp; importing valid rows…
            </span>
          )}
          {status === 'executed' && onUndo && (
            <button
              type="button"
              onClick={handleUndo}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '0.75rem',
                border: '1px solid var(--aia-hairline)',
                background: 'var(--aia-inset)',
                color: 'var(--aia-text)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={13} />
              Undo Import
            </button>
          )}
        </div>

        {preview.invalidCount > 0 && (
          <button
            type="button"
            onClick={onDownloadErrorCsv}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 10px',
              borderRadius: '0.75rem',
              border: '1px solid color-mix(in oklab, var(--aia-debit) 30%, transparent)',
              background: 'color-mix(in oklab, var(--aia-debit) 10%, transparent)',
              color: 'var(--aia-debit)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Download size={13} />
            Error Report CSV
          </button>
        )}
      </div>
    </div>
  );
}
