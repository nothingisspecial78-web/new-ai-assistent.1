import React, { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw, Bot } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class AssistantErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.warn("[AssistantErrorBoundary] AI Assistant isolated error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl border border-amber-500/30 bg-neutral-900/90 px-4 py-2.5 text-xs text-white shadow-2xl backdrop-blur-md">
          <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
            <Bot className="size-4" />
          </div>
          <div>
            <span className="font-semibold text-neutral-200">AI Assistant Paused</span>
            <p className="text-[10px] text-neutral-400">Encountered a recoverable issue</p>
          </div>
          <button
            onClick={this.handleRetry}
            className="ml-2 flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-neutral-950 transition-colors hover:bg-amber-400"
          >
            <RefreshCw className="size-3" />
            <span>Retry</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
