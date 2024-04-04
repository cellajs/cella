import './index.css';

import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeManager } from '~/modules/common/theme-manager';

import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import './lib/i18n';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

import { renderAscii } from '~/lib/ascii';
import { queryClient } from './lib/query-client';
import router from './lib/router';
import { initSentry } from './lib/sentry';

// Render ASCII logo in console
renderAscii();

// Initialize Sentry
initSentry();

ReactDOM.createRoot(root).render(
  <StrictMode>
    <ThemeManager />
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
