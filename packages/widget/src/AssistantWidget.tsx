import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair } from 'lucide-react';
import type { ActionLogEntry, ChatAttachment, GuideDef, GuideStep, RightClickContext } from '@ai-assistant/core';
import { AgentCursorOverlay } from './components/AgentCursorOverlay.tsx';
import { AssistantAvatar3D } from './components/AssistantAvatar3D.tsx';
import { Composer } from './components/Composer.tsx';
import { ContextMenu } from './components/ContextMenu.tsx';
import { CursorInspector } from './components/CursorInspector.tsx';
import { FileDrop } from './components/FileDrop.tsx';
import { HistoryDrawer } from './components/HistoryDrawer.tsx';
import { MessageList } from './components/MessageList.tsx';
import { Panel } from './components/Panel.tsx';
import { PersonalizationModal } from './components/PersonalizationModal.tsx';
import { GuideEngine, GuideOverlay } from './guide/index.ts';
import { useChatStorage } from './hooks/useChatStorage.ts';
import { useChatStream } from './hooks/useChatStream.ts';
import { ensureWidgetStyles } from './styles.ts';

export interface AssistantWidgetTheme {
  primaryColor?: string;
  primaryTextColor?: string;
  accentColor?: string;
  surfaceColor?: string;
  textColor?: string;
  position?: 'right' | 'left';
}

export interface AssistantWidgetProps {
  appId: string;
  apiUrl: string;
  userKey?: string;
  userLabel?: string;
  getPageId?: () => string;
  getAuthToken?: () => string | Promise<string>;
  getAppState?: () => Record<string, unknown>;
  onAppCommand?: (command: string, payload: Record<string, unknown>) => void;
  title?: string;
  suggestions?: string[];
  theme?: AssistantWidgetTheme;
  rtl?: boolean;
  enabled?: boolean;
  onActionCompleted?: (action: ActionLogEntry) => void;
}

export function AssistantWidget({
  appId,
  apiUrl,
  userKey,
  userLabel,
  getPageId,
  getAuthToken,
  getAppState,
  onAppCommand,
  title = 'Khazna AI Agent',
  suggestions,
  theme,
  rtl = false,
  enabled = true,
  onActionCompleted,
}: AssistantWidgetProps) {
  const [open, setOpen] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [panelWidth, setPanelWidth] = useState(0);
  const [celebrateTick, setCelebrateTick] = useState(0);
  const [pendingContexts, setPendingContexts] = useState<RightClickContext[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<'none' | 'history' | 'personalize'>('none');
  const [mobileMode, setMobileMode] = useState<'compact' | 'full'>('compact');
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 640
  );
  const [dynamicChips, setDynamicChips] = useState<Array<{ id: string; label: string; prompt: string }>>([]);
  const chipsCacheRef = useRef<Map<string, Array<{ id: string; label: string; prompt: string }>>>(new Map());

  // Guide Walkthrough & 3D Avatar State
  const [activeGuide, setActiveGuide] = useState<GuideDef | null>(null);
  const [activeStep, setActiveStep] = useState<GuideStep | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [guidePaused, setGuidePaused] = useState(false);
  const [avatarMuted, setAvatarMuted] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [targetNotFound, setTargetNotFound] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [stuckHint, setStuckHint] = useState<string | null>(null);
  const [offerMiniChat, setOfferMiniChat] = useState(false);
  const [detectedError, setDetectedError] = useState<string | null>(null);
  const [savedGuideProgress, setSavedGuideProgress] = useState<ReturnType<typeof GuideEngine.getSavedProgress>>(null);
  const guideEngineRef = useRef<GuideEngine | null>(null);

  const position = theme?.position || (rtl ? 'left' : 'right');

  useEffect(() => {
    ensureWidgetStyles();
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobileViewport(window.innerWidth <= 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const {
    threads,
    activeThread,
    activeThreadId,
    personalization,
    createNewThread,
    selectThread,
    renameThreadById,
    deleteThreadById,
    clearAllUserThreads,
    syncActiveMessages,
    updatePersonalization,
  } = useChatStorage(appId, userKey);

  const handleActionCompleted = useCallback(
    (action: ActionLogEntry) => {
      setCelebrateTick((c) => c + 1);
      onActionCompleted?.(action);
    },
    [onActionCompleted]
  );

  const handleUiAction = useCallback(() => {
    setCelebrateTick((c) => c + 1);
  }, []);

  const onAppCommandRef = useRef(onAppCommand);
  onAppCommandRef.current = onAppCommand;
  const getAuthTokenRef = useRef(getAuthToken);
  getAuthTokenRef.current = getAuthToken;

  const handleStartGuide = useCallback(
    async (guideId: string, startStep?: string) => {
      try {
        const token = getAuthTokenRef.current ? await getAuthTokenRef.current() : '';
        const headers: Record<string, string> = { 'x-app-id': appId };
        if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

        const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/assistant/guides/${encodeURIComponent(guideId)}`, {
          headers,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && data.guide && guideEngineRef.current) {
          const guideDef = data.guide as GuideDef;
          if (
            guideDef.startRoute &&
            typeof window !== 'undefined' &&
            window.location.pathname !== guideDef.startRoute
          ) {
            onAppCommandRef.current?.('NAVIGATE', { route: guideDef.startRoute });
          }
          setSavedGuideProgress(null);
          setGuidePaused(false);
          setOpen(false);
          setActiveGuide(guideDef);
          await guideEngineRef.current.start(guideDef, startStep);
        }
      } catch (err) {
        console.error('Failed to start guide:', err);
      }
    },
    [apiUrl, appId]
  );

  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    editAndResendMessage,
    submitInteractiveForm,
    cancelInteractiveForm,
    uploadSpreadsheet,
    confirmAction,
    confirmImportPreview,
    undoAction,
    downloadErrorCsv,
    clearMessages,
  } = useChatStream({
    appId,
    apiUrl,
    userKey,
    threadKey: `${userKey || 'default'}:${activeThreadId}`,
    initialMessages: activeThread.messages,
    personalization,
    getAuthToken,
    getAppState,
    onAppCommand,
    onActionCompleted: handleActionCompleted,
    onUiAction: handleUiAction,
    onStartGuide: handleStartGuide,
    onMessagesChange: syncActiveMessages,
  });

  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  // Initialize GuideEngine once per app/api session
  useEffect(() => {
    const engine = new GuideEngine({
      apiUrl,
      appId,
      defaultLang: personalization.preferredLanguage || 'en',
      getAuthToken: () => (getAuthTokenRef.current ? getAuthTokenRef.current() : ''),
      onStateChange: (st) => {
        setGuidePaused(st === 'paused');
      },
      onStepChange: (step, idx) => {
        setActiveStep(step);
        setStepIndex(idx);
      },
      onTargetUpdate: (rect, notFound) => {
        setTargetRect(rect);
        setTargetNotFound(notFound);
      },
      onSpeakChange: (speaking) => {
        setIsSpeaking(speaking);
      },
      onStuckHint: (hint) => {
        setStuckHint(hint);
      },
      onOfferMiniChat: (offer) => {
        setOfferMiniChat(offer);
      },
      onDetectedError: (msg) => {
        setDetectedError(msg);
      },
      onComplete: (g) => {
        setCelebrateTick((c) => c + 1);
        setActiveGuide(null);
        setActiveStep(null);
        setTargetRect(null);
        setSavedGuideProgress(null);
        setOpen(true);
        void sendMessageRef.current({
          text: `I've finished the walkthrough for "${g.title.en}". What would you like to do next?`,
        });
      },
      onAbort: () => {
        setActiveGuide(null);
        setActiveStep(null);
        setTargetRect(null);
        setSavedGuideProgress(null);
      },
      onAskMiniChat: (q) => {
        setOpen(true);
        void sendMessageRef.current({ text: q });
      },
    });
    guideEngineRef.current = engine;
    setAvatarMuted(engine.voiceController.isMuted());
    return () => {
      engine.destroy();
      guideEngineRef.current = null;
    };
  }, [apiUrl, appId]);

  // Keep GuideEngine language aligned with user personalization
  useEffect(() => {
    guideEngineRef.current?.setLanguage(personalization.preferredLanguage || 'en');
  }, [personalization.preferredLanguage]);

  // Check if there is an interrupted guide to resume when opening panel
  useEffect(() => {
    if (open && !activeGuide) {
      setSavedGuideProgress(GuideEngine.getSavedProgress());
    }
  }, [open, activeGuide]);

  // Fetch dynamic chips when opening panel or navigating pages
  useEffect(() => {
    if (!open) return;
    const pageId = getPageId ? getPageId() : 'global';
    const lang = personalization.preferredLanguage || 'en';
    const cacheKey = `${pageId}:${lang}:${userKey || 'default'}`;

    if (chipsCacheRef.current.has(cacheKey)) {
      setDynamicChips(chipsCacheRef.current.get(cacheKey) || []);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const token = getAuthToken ? await getAuthToken() : '';
        const headers: Record<string, string> = { 'x-app-id': appId };
        if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

        const res = await fetch(
          `${apiUrl.replace(/\/$/, '')}/api/assistant/chips?pageId=${encodeURIComponent(pageId)}&lang=${encodeURIComponent(lang)}`,
          { headers, signal: controller.signal }
        );
        if (res.ok) {
          const data = (await res.json()) as { chips?: Array<{ id: string; label: string; prompt: string }> };
          if (Array.isArray(data.chips)) {
            chipsCacheRef.current.set(cacheKey, data.chips);
            setDynamicChips(data.chips);
          }
        }
      } catch {
        // fallback to default suggestions
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, getPageId, getAuthToken, apiUrl, appId, personalization.preferredLanguage, userKey]);

  // Combine role-specific suggestions with server-ranked page-aware chips
  const combinedChips = useMemo(() => {
    const list: Array<{ id: string; label: string; prompt: string }> = [];
    const seenPrompts = new Set<string>();

    if (suggestions) {
      for (let i = 0; i < suggestions.length; i++) {
        const s = suggestions[i];
        if (!seenPrompts.has(s.toLowerCase())) {
          seenPrompts.add(s.toLowerCase());
          list.push({ id: `role-sug-${i}`, label: s, prompt: s });
        }
      }
    }

    for (const c of dynamicChips) {
      if (!seenPrompts.has(c.prompt.toLowerCase())) {
        seenPrompts.add(c.prompt.toLowerCase());
        list.push(c);
      }
    }

    return list;
  }, [dynamicChips, suggestions]);

  // Reset transient overlays when switching appId or userKey
  useEffect(() => {
    setPendingContexts([]);
    setUploadError(null);
    setInspecting(false);
    setActiveOverlay('none');
  }, [appId, userKey]);

  // Preserve Turn 2 behavior: opening starts on a fresh new chat (old chats remain in History)
  useEffect(() => {
    if (!open && !inspecting && !activeGuide && activeThread.messages.length > 0) {
      createNewThread();
    }
  }, [open, inspecting, activeGuide, activeThread.messages.length, createNewThread]);

  if (!enabled) return null;

  const openPanel = (mode: 'compact' | 'full' = 'compact') => {
    setMobileMode(mode);
    setOpen(true);
  };

  const toggleInspectMode = () => {
    setInspecting((prev) => {
      const next = !prev;
      if (next && typeof window !== 'undefined' && window.innerWidth <= 640) {
        setOpen(false);
      }
      return next;
    });
  };

  const appendContext = (ctx: RightClickContext) => {
    setPendingContexts((prev) => {
      const exists = prev.some(
        (c) =>
          (c.cssSelector && ctx.cssSelector && c.cssSelector === ctx.cssSelector) ||
          (c.text && ctx.text && c.text === ctx.text)
      );
      if (exists) return prev;
      return [...prev, ctx].slice(-5);
    });
  };

  const handleInspectSelect = (ctx: RightClickContext) => {
    setInspecting(false);
    appendContext(ctx);
    openPanel('compact');
  };

  const handleUploadSpreadsheet = async (
    file: File,
    targetArea?: 'auto' | 'students' | 'managers' | 'bulk-entries'
  ) => {
    setUploadError(null);
    openPanel('compact');
    try {
      await uploadSpreadsheet(file, { targetArea });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'File upload failed.');
    }
  };

  const handleDropFiles = (files: FileList) => {
    Array.from(files).forEach((file) => {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
        void handleUploadSpreadsheet(file);
      } else if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            const att: ChatAttachment = {
              type: 'image',
              name: file.name || 'screenshot.png',
              mimeType: file.type,
              dataUrl: reader.result,
            };
            void sendMessage({
              text: 'Please analyze this screenshot and tell me how to resolve any issue.',
              attachments: [att],
              contexts: pendingContexts.length > 0 ? pendingContexts : undefined,
            });
          }
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const rootStyle: React.CSSProperties & Record<string, string> = {
    ...(theme?.primaryColor ? { '--aia-primary': theme.primaryColor } : {}),
    ...(theme?.primaryTextColor ? { '--aia-primary-fg': theme.primaryTextColor } : {}),
    ...(theme?.accentColor ? { '--aia-accent': theme.accentColor } : {}),
    ...(theme?.surfaceColor ? { '--aia-surface': theme.surfaceColor } : {}),
    ...(theme?.textColor ? { '--aia-text': theme.textColor } : {}),
  };

  return (
    <div className="aia-root" style={rootStyle}>
      <AgentCursorOverlay />

      <ContextMenu
        enabled={enabled && !inspecting}
        onAskAboutElement={(ctx) => {
          appendContext(ctx);
          openPanel('compact');
        }}
      />

      <CursorInspector
        active={inspecting}
        onCancel={() => setInspecting(false)}
        onSelectElement={handleInspectSelect}
      />

      <div
        className={`aia-avatar-dock ${open ? 'aia-dock-open' : ''}`}
        style={{
          [position]: open ? `${panelWidth + 24}px` : '18px',
        }}
      >
        <AssistantAvatar3D
          title={title}
          open={open}
          thinking={isStreaming}
          sensitive={Boolean(activeStep?.sensitive)}
          celebrateTick={celebrateTick}
          accentColor={theme?.accentColor || '#f97316'}
          primaryColor={theme?.primaryColor || '#0f172a'}
          onClick={() => {
            setInspecting(false);
            if (!open) {
              createNewThread();
              openPanel('compact');
            }
          }}
        />
      </div>

      <Panel
        open={open}
        title={title}
        position={position}
        rtl={rtl}
        inspecting={inspecting}
        mobileMode={mobileMode}
        onMobileModeChange={setMobileMode}
        onToggleInspect={toggleInspectMode}
        onOpenHistory={() => {
          setMobileMode('full');
          setActiveOverlay((cur) => (cur === 'history' ? 'none' : 'history'));
        }}
        onOpenPersonalize={() => {
          setMobileMode('full');
          setActiveOverlay((cur) => (cur === 'personalize' ? 'none' : 'personalize'));
        }}
        onNewChat={() => {
          setActiveOverlay('none');
          createNewThread();
        }}
        onEffectiveWidthChange={setPanelWidth}
        onClose={() => {
          setInspecting(false);
          setActiveOverlay('none');
          setOpen(false);
        }}
      >
        <FileDrop onDropFiles={handleDropFiles}>
          {activeOverlay === 'history' && (
            <HistoryDrawer
              threads={threads}
              activeThreadId={activeThreadId}
              userLabel={userLabel}
              onSelect={(id) => {
                selectThread(id);
                setActiveOverlay('none');
              }}
              onCreate={() => {
                createNewThread();
                setActiveOverlay('none');
              }}
              onRename={renameThreadById}
              onDelete={deleteThreadById}
              onClearAll={() => {
                clearAllUserThreads();
                clearMessages();
              }}
              onClose={() => setActiveOverlay('none')}
            />
          )}

          {activeOverlay === 'personalize' && (
            <PersonalizationModal
              value={personalization}
              userLabel={userLabel}
              onSave={updatePersonalization}
              onClose={() => setActiveOverlay('none')}
            />
          )}

          {savedGuideProgress && !activeGuide && (
            <div className="aia-guide-resume-bar">
              <span>
                Resume guide: <strong>{savedGuideProgress.title?.en || savedGuideProgress.guideId}</strong>
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => void handleStartGuide(savedGuideProgress.guideId, savedGuideProgress.stepId)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--aia-primary)',
                    color: '#fff',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => {
                    GuideEngine.clearSavedProgress();
                    setSavedGuideProgress(null);
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '8px',
                    border: '1px solid var(--aia-hairline)',
                    background: 'transparent',
                    color: 'var(--aia-text-muted)',
                    fontSize: '11.5px',
                    cursor: 'pointer',
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {(error || uploadError) && (
            <div
              role="alert"
              style={{
                margin: '10px 14px 0',
                padding: '9px 12px',
                borderRadius: '12px',
                background: 'color-mix(in oklab, var(--aia-debit) 10%, transparent)',
                border: '1px solid color-mix(in oklab, var(--aia-debit) 30%, transparent)',
                color: 'var(--aia-debit)',
                fontSize: '12.5px',
                fontWeight: 500,
              }}
            >
              {uploadError || error}
            </div>
          )}

          <MessageList
            messages={messages}
            suggestions={combinedChips.map((c) => c.prompt)}
            mobileCompactMode={isMobileViewport && mobileMode === 'compact'}
            onExpandMobileHistory={() => setMobileMode('full')}
            onSuggestionClick={(q) => {
              const matched = combinedChips.find((c) => c.prompt === q);
              if (matched && !matched.id.startsWith('role-sug-')) {
                const pageId = getPageId ? getPageId() : 'global';
                void (async () => {
                  try {
                    const token = getAuthToken ? await getAuthToken() : '';
                    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                    if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
                    await fetch(`${apiUrl.replace(/\/$/, '')}/api/assistant/chips/click`, {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({ chipId: matched.id, pageId }),
                    });
                  } catch {
                    // ignore telemetry error
                  }
                })();
              }
              void sendMessage({
                text: q,
                contexts: pendingContexts.length > 0 ? pendingContexts : undefined,
              });
              setPendingContexts([]);
            }}
            onSubmitForm={submitInteractiveForm}
            onCancelForm={cancelInteractiveForm}
            onConfirmAction={confirmAction}
            onUndoAction={undoAction}
            onConfirmImport={confirmImportPreview}
            onDownloadErrorCsv={downloadErrorCsv}
            onEditMessage={(id, nextText) => {
              void editAndResendMessage(id, nextText);
            }}
            onActionCompleted={onActionCompleted}
          />

          <Composer
            disabled={isStreaming}
            apiUrl={apiUrl}
            appId={appId}
            defaultLanguage={personalization.preferredLanguage || 'auto'}
            voiceAutoSend={Boolean(personalization.voiceAutoSend)}
            pendingContexts={pendingContexts}
            onClearContext={() => setPendingContexts([])}
            onRemoveContext={(idx) =>
              setPendingContexts((prev) => prev.filter((_, i) => i !== idx))
            }
            onAskAboutContexts={(ctxs) => {
              const labels = ctxs
                .map((c) => c.nearbyLabel?.trim())
                .filter((s): s is string => Boolean(s));
              const q =
                labels.length === 1
                  ? `What does "${labels[0]}" show here?`
                  : labels.length > 1
                    ? `Explain these ${labels.length} selected cards (${labels.join(', ')})`
                    : 'What is shown in these selected cards?';
              void sendMessage({ text: q, contexts: ctxs });
              setPendingContexts([]);
            }}
            onToggleInspect={toggleInspectMode}
            onSend={({ text, attachments, language }) => {
              void sendMessage({
                text,
                attachments,
                language,
                contexts: pendingContexts.length > 0 ? pendingContexts : undefined,
              });
              setPendingContexts([]);
            }}
            onUploadSpreadsheet={(file, targetArea) => {
              void handleUploadSpreadsheet(file, targetArea);
            }}
          />
        </FileDrop>
      </Panel>

      {activeGuide && activeStep && (
        <GuideOverlay
          guide={activeGuide}
          currentStepIndex={stepIndex}
          currentStep={activeStep}
          lang={personalization.preferredLanguage || 'en'}
          targetRect={targetRect}
          targetNotFound={targetNotFound}
          paused={guidePaused}
          muted={avatarMuted}
          isSpeaking={isSpeaking}
          stuckHint={stuckHint}
          offerMiniChat={offerMiniChat}
          detectedError={detectedError}
          onBack={() => void guideEngineRef.current?.back()}
          onNext={() => void guideEngineRef.current?.next()}
          onRepeat={() => void guideEngineRef.current?.repeat()}
          onTogglePause={() => {
            if (guidePaused) {
              guideEngineRef.current?.resume();
              setGuidePaused(false);
            } else {
              guideEngineRef.current?.pause();
              setGuidePaused(true);
            }
          }}
          onToggleMute={() => {
            const next = !avatarMuted;
            setAvatarMuted(next);
            guideEngineRef.current?.voiceController.setMuted(next);
          }}
          onAskQuestion={() => {
            const stepLabel = activeStep.instruction.en;
            setOpen(true);
            void sendMessage({
              text: `Explain this step in "${activeGuide.title.en}": ${stepLabel}`,
            });
          }}
          onExit={() => {
            guideEngineRef.current?.abort();
            setActiveGuide(null);
            setActiveStep(null);
            setTargetRect(null);
          }}
        />
      )}
    </div>
  );
}
