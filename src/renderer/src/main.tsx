import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary, reportRendererFailure } from './components/ErrorBoundary';
// The brand kit's Struck M (branding/logo/mark), for the window icon and the
// loading screen. It replaced the old Michael portrait (owner, 2026-09-25).
import brandMark from '@brandkit/logo/mark/struck-m-light.svg?url';
import './design/global.css';
import './i18n';

const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/svg+xml';
favicon.href = brandMark;
document.head.appendChild(favicon);

const splashMark = document.querySelector('#cth-splash .mk');
if (splashMark) {
  const img = document.createElement('img');
  img.src = brandMark;
  img.alt = "Don't Be Michael";
  img.style.cssText = 'height:56px;width:auto;display:block';
  splashMark.replaceWith(img);
}

// Errors outside a render (an event handler, a timer, a promise) are failure
// reports too (docs/designs/auto-report-failures.md).
window.addEventListener('error', (e) => reportRendererFailure('renderer-error', e.error));
window.addEventListener('unhandledrejection', (e) => reportRendererFailure('renderer-error', e.reason));

const root = document.getElementById('root');
if (!root) throw new Error('No root element');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
