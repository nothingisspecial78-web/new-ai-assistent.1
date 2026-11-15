import React, { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  History,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Sparkles,
  SquarePen,
  X,
} from 'lucide-react';

export interface PanelProps {
  open: boolean;
  title: string;
  position?: 'right' | 'left';
  rtl?: boolean;
  inspecting?: boolean;
  mobileMode?: 'compact' | 'full';
  onMobileModeChange?: (mode: 'compact' | 'full') => void;
  onToggleInspect?: () => void;
  onOpenHistory?: () => void;
  onOpenPersonalize?: () => void;
  onNewChat?: () => void;
  onEffectiveWidthChange?: (width: number) => void;
  onClose: () => void;
  children: React.ReactNode;
}

export function Panel({
  open,
  title,
  position = 'right',
  rtl = false,
  inspecting = false,
  mobileMode = 'compact',
  onMobileModeChange,
  onToggleInspect,
  onOpenHistory,
  onOpenPersonalize,
  onNewChat,
  onEffectiveWidthChange,
  onClose,
  children,
}: PanelProps) {
  const [width, setWidth] = useState(440);
  const [collapsed, setCollapsed] = useState(false);
  const draggingRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);
  const touchLastYRef = useRef<number | null>(null);
  const effectiveWidth = collapsed ? 336 : width;

  useEffect(() => {
    onEffectiveWidthChange?.(open ? effectiveWidth : 0);
  }, [open, effectiveWidth, onEffectiveWidthChange]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const raw = position === 'right' ? window.innerWidth - e.clientX : e.clientX;
      setWidth(Math.max(340, Math.min(720, raw)));
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [position]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
    touchLastYRef.current = touchStartYRef.current;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches[0]) {
      touchLastYRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchEnd = () => {
    if (touchStartYRef.current === null || touchLastYRef.current === null) return;
    const deltaY = touchLastYRef.current - touchStartYRef.current;
    touchStartYRef.current = null;
    touchLastYRef.current = null;

    if (deltaY < -36) {
      // Swipe up -> expand to full history
      onMobileModeChange?.('full');
    } else if (deltaY > 36) {
      // Swipe down -> collapse full -> compact, or close from compact
      if (mobileMode === 'full') {
        onMobileModeChange?.('compact');
      } else {
        onClose();
      }
    }
  };

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-label={title}
      dir={rtl ? 'rtl' : 'ltr'}
      data-testid="assistant-panel"
      data-mobile-mode={mobileMode}
      className={`aia-panel ${position === 'left' ? 'aia-left' : ''} ${
        mobileMode === 'compact' ? 'aia-panel-compact' : 'aia-panel-full'
      }`}
      style={{
        width: `${effectiveWidth}px`,
        [position]: '12px',
      }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize assistant panel"
        className="aia-resize-handle"
        style={{ [position === 'right' ? 'left' : 'right']: 0 }}
        onMouseDown={() => {
          draggingRef.current = true;
        }}
      />

      {/* Mobile swipe handle pill */}
      <div
        data-testid="mobile-sheet-handle"
        className="aia-mobile-handle"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => onMobileModeChange?.(mobileMode === 'compact' ? 'full' : 'compact')}
        title={mobileMode === 'compact' ? 'Swipe up or tap for full chat history' : 'Swipe down to compact'}
      >
        <span className="aia-mobile-handle-bar" />
      </div>

      <header
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid var(--aia-hairline)',
          background: 'transparent',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <span
            aria-hidden="true"
            style={{
              display: 'grid',
              placeItems: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '0.75rem',
              background: 'var(--aia-gradient-primary)',
              color: 'var(--aia-primary-fg)',
              boxShadow: 'var(--aia-shadow-glow)',
              flexShrink: 0,
            }}
          >
            <Sparkles size={15} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                color: 'var(--aia-subtle)',
                lineHeight: 1.2,
              }}
            >
              Campus Ledger Copilot
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 700,
                fontFamily: 'var(--aia-font-display)',
                color: 'var(--aia-text)',
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {title}
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {onOpenHistory && (
            <button
              type="button"
              data-testid="history-btn"
              onClick={onOpenHistory}
              aria-label="Chat history"
              title="Chat history"
              className="aia-icon-btn"
            >
              <History size={15} />
            </button>
          )}
          {onOpenPersonalize && (
            <button
              type="button"
              data-testid="personalize-btn"
              onClick={onOpenPersonalize}
              aria-label="Personalize AI"
              title="Personalize AI preferences"
              className="aia-icon-btn"
            >
              <SlidersHorizontal size={15} />
            </button>
          )}
          {onToggleInspect && (
            <button
              type="button"
              data-testid="cursor-denoter-header"
              onClick={onToggleInspect}
              aria-pressed={inspecting}
              aria-label={inspecting ? 'Cancel cursor denoter' : 'Select a cuboid on the page'}
              title="Select a card or cuboid on the page"
              className={`aia-icon-btn ${inspecting ? 'aia-active' : ''}`}
            >
              <Crosshair size={15} />
            </button>
          )}
          {onNewChat && (
            <button
              type="button"
              data-testid="new-chat-btn"
              onClick={onNewChat}
              aria-label="New conversation"
              title="New conversation"
              className="aia-icon-btn"
            >
              <SquarePen size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand panel width' : 'Compact panel width'}
            title={collapsed ? 'Expand panel' : 'Compact panel'}
            className="aia-icon-btn aia-desktop-only"
          >
            {collapsed ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assistant panel"
            title="Close"
            className="aia-icon-btn"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          background: 'transparent',
        }}
      >
        {children}
      </div>
    </aside>
  );
}
