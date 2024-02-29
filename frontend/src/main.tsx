import './index.css';
import { config } from 'config';

import { StrictMode, Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { Theming } from '~/hooks/use-theme';

import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import './lib/i18n';
import router, { queryClient } from './router';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

// Lazy load gleap chat support
const GleapSupport = config.has.chatSupport ? lazy(() => import('~/modules/common/gleap')) : () => null;

ReactDOM.createRoot(root).render(
  <StrictMode>
    <Theming />
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>

    <Suspense fallback={null}>
      <GleapSupport />
    </Suspense>
  </StrictMode>,
);
