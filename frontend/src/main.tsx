import './index.css';

import { getI18n } from 'i18n/index';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Theming } from '~/hooks/useTheme';

import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import router, { queryClient } from './router';

getI18n('frontend');

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Theming />
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
