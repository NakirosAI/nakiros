import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui';

interface BoundaryProps {
  children: ReactNode;
  resetKey: string;
}

interface BoundaryState {
  error: Error | null;
}

class DashboardErrorBoundaryInner extends Component<BoundaryProps & {
  title: string;
  body: string;
  retry: string;
}, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dashboard render crash', error, info);
  }

  componentDidUpdate(prevProps: BoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--bg)] p-8">
        <div className="max-w-2xl rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-lg)]">
          <h2 className="text-lg font-semibold text-[var(--text)]">{this.props.title}</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{this.props.body}</p>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-3 text-xs text-[var(--text)]">
            {this.state.error.message || String(this.state.error)}
          </pre>
          <div className="mt-4">
            <Button onClick={() => this.setState({ error: null })}>
              {this.props.retry}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * React error boundary wrapped around the dashboard view tree. Renders a
 * localised "Something went wrong" panel with the error message and a
 * retry button. Resets automatically when `resetKey` changes (the parent
 * passes the active project + tab so switching either clears the error).
 */
export default function DashboardErrorBoundary({ children, resetKey }: BoundaryProps) {
  const { t } = useTranslation('dashboard');

  return (
    <DashboardErrorBoundaryInner
      resetKey={resetKey}
      title={t('renderErrorTitle')}
      body={t('renderErrorBody')}
      retry={t('renderErrorRetry')}
    >
      {children}
    </DashboardErrorBoundaryInner>
  );
}
