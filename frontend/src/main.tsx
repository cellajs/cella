import { config } from 'config';
import './index.css';

import { StrictMode, Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeManager } from '~/modules/common/theme-manager';

import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import './lib/i18n';
import router, { queryClient } from './router';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

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
