import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Enhanced error logging for the browser console / dev tools
    console.group('%c[ERROR BOUNDARY] Application Error', 'color:#ef4444;font-weight:bold;font-size:14px');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('Error Object:', error);
    console.groupEnd();
  }

  handleReload = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleDismiss = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a] p-6">
          <div className="max-w-lg rounded-xl border border-red-900/50 bg-red-950/20 p-8 text-center">
            <h2 className="text-xl font-bold text-red-400">Something went wrong</h2>
            <p className="mt-2 text-sm text-slate-400">
              An unexpected error occurred. Try reloading the page.
            </p>
            {this.state.error && (
              <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-left text-xs text-red-300">
                {this.state.error.message}
              </pre>
            )}
            <div className="mt-6 flex gap-3 justify-center">
              <button
                onClick={this.handleDismiss}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
