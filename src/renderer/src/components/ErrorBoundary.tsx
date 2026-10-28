import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';

/**
 * Catches a render crash anywhere under it, so the window shows a short line
 * and a Reload button instead of going blank. The error itself goes to the
 * console, never to the owner, and to an automatic failure report
 * (docs/designs/auto-report-failures.md).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[renderer] a screen crashed', error, info.componentStack);
    reportRendererFailure('screen-crash', error);
  }

  render(): ReactNode {
    return this.state.failed ? <CrashScreen /> : this.props.children;
  }
}

/** Sends a renderer failure to main: the error's name and stack only. */
export function reportRendererFailure(kind: 'screen-crash' | 'renderer-error', error: unknown): void {
  try {
    const e = error instanceof Error ? error : null;
    window.cth.reportFailure?.({ kind, name: e?.name ?? 'Error', stack: (e?.stack ?? '').slice(0, 8192) });
  } catch { /* reporting never breaks a screen */ }
}

export function CrashScreen() {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        background: 'var(--cth-bg)',
        color: 'var(--cth-ink)',
        fontFamily: 'var(--cth-font-ui)'
      }}
    >
      <div style={{ fontSize: 14, lineHeight: '20px', fontWeight: 600 }}>{t('crash.line')}</div>
      <PixelButton onClick={() => window.location.reload()}>{t('crash.reload')}</PixelButton>
    </div>
  );
}
