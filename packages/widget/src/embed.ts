import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AssistantWidget, type AssistantWidgetProps } from './AssistantWidget.tsx';

export interface EmbedInitOptions {
  appId: string;
  apiUrl: string;
  authToken?: string;
  getAuthToken?: () => string | Promise<string>;
  title?: string;
  position?: 'right' | 'left';
  rtl?: boolean;
  primaryColor?: string;
}

let mountedRoot: Root | null = null;
let mountNode: HTMLElement | null = null;

export function mountAssistantWidget(options: EmbedInitOptions): void {
  if (typeof document === 'undefined') return;

  if (!mountNode) {
    mountNode = document.createElement('div');
    mountNode.id = 'ai-assistant-embed-root';
    document.body.appendChild(mountNode);
    mountedRoot = createRoot(mountNode);
  }

  const props: AssistantWidgetProps = {
    appId: options.appId,
    apiUrl: options.apiUrl,
    getAuthToken:
      options.getAuthToken ||
      (options.authToken ? () => options.authToken! : undefined),
    title: options.title || 'AI Assistant',
    rtl: options.rtl,
    theme: {
      position: options.position,
      primaryColor: options.primaryColor,
    },
  };

  mountedRoot?.render(React.createElement(AssistantWidget, props));
}

export function unmountAssistantWidget(): void {
  mountedRoot?.unmount();
  mountNode?.remove();
  mountedRoot = null;
  mountNode = null;
}

// Auto-mount if loaded via <script src="assistant.js" data-app-id="..." data-api-url="...">
function autoInitFromScriptTag(): void {
  if (typeof document === 'undefined') return;
  const currentScript =
    (document.currentScript as HTMLScriptElement | null) ||
    document.querySelector<HTMLScriptElement>('script[data-app-id]');

  if (!currentScript) return;
  const appId = currentScript.getAttribute('data-app-id');
  const apiUrl = currentScript.getAttribute('data-api-url') || window.location.origin;
  if (!appId) return;

  const init = () =>
    mountAssistantWidget({
      appId,
      apiUrl,
      authToken: currentScript.getAttribute('data-auth-token') || undefined,
      title: currentScript.getAttribute('data-title') || undefined,
      position:
        currentScript.getAttribute('data-position') === 'left' ? 'left' : 'right',
      rtl: currentScript.getAttribute('data-rtl') === 'true',
      primaryColor: currentScript.getAttribute('data-primary-color') || undefined,
    });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}

declare global {
  interface Window {
    AIAssistant?: {
      init: typeof mountAssistantWidget;
      destroy: typeof unmountAssistantWidget;
    };
  }
}

if (typeof window !== 'undefined') {
  window.AIAssistant = {
    init: mountAssistantWidget,
    destroy: unmountAssistantWidget,
  };
  autoInitFromScriptTag();
}
