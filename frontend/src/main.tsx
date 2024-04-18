import './index.css';

import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeManager } from '~/modules/common/theme-manager';

import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import './lib/i18n';

const root = document.getElementById('root');


// Enable mocking in development
// https://mswjs.io/docs/getting-started/integrate/node
async function enableMocking() {
  if (process.env.NODE_ENV !== 'development') return;
  const { worker } = await import('./mocks/browser');
  // Ignore requests that not /mock/kanban
  worker.events.on('request:start', ({ request }) => {
    console.log(request.url);
    const urlObject = new URL(request.url);
    if (!urlObject.pathname.startsWith('/mock/')) return;
  });
  // `worker.start()` returns a Promise that resolves
  // once the Service Worker is up and ready to intercept requests.
  return worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      options: {
        // Establish scope of the pages that the worker can control.
        scope: '/mock',
      },
    },
  });
}

if (!root) {
  throw new Error('Root element not found');
}

import { renderAscii } from '~/lib/ascii';
import { queryClient } from '~/lib/router';
import router from '~/lib/router';
import { initSentry } from '~/lib/sentry';

// Render ASCII logo in console
renderAscii();

// Initialize Sentry
initSentry();

enableMocking().then(() => {
  ReactDOM.createRoot(root).render(
    <StrictMode>
      <ThemeManager />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
});
