import './index.css';

import { StrictMode, Suspense } from 'react';
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

ReactDOM.createRoot(root).render(
  <StrictMode>
    <Suspense>
      <Theming />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </Suspense>
  </StrictMode>,
);
