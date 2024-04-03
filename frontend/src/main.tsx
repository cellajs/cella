import { config } from 'config';
import './index.css';

import { StrictMode, Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeManager } from '~/modules/common/theme-manager';

import * as Sentry from '@sentry/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import './lib/i18n';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

import ascii from '~/lib/ascii';
import router, { queryClient } from './lib/router';

ascii();

Sentry.init({
  dsn: config.sentryDsn,

  enabled: config.mode === 'production',
  environment: config.mode,

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  tracesSampleRate: 1.0,

  // Set `tracePropagationTargets` to control for which URLs distributed tracing should be enabled
  tracePropagationTargets: ['localhost'],

  // Capture Replay for 10% of all sessions,
  // plus for 100% of sessions with an error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// Lazy load gleap chat support
const GleapSupport = config.gleapToken ? lazy(() => import('~/modules/common/gleap')) : () => null;

ReactDOM.createRoot(root).render(
  <StrictMode>
    <ThemeManager />
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>

    <Suspense fallback={null}>
      <GleapSupport />
    </Suspense>
  </StrictMode>,
);
