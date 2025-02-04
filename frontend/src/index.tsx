import '~/index.css';

import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeManager } from '~/modules/common/theme-manager';

import { RouterProvider } from '@tanstack/react-router';

// Boot with i18n & dayjs
import '~/lib/dayjs';
import '~/lib/i18n';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

import router from '~/lib/router';
import { initSentry } from '~/lib/sentry';
import { QueryClientProvider } from '~/query';
import { renderAscii } from '~/utils/ascii';

// Render ASCII logo in console
renderAscii();

// Initialize Sentry
initSentry();

ReactDOM.createRoot(root).render(
  <StrictMode>
    <ThemeManager />
    <QueryClientProvider>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
