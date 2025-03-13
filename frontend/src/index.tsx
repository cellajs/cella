import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { scan } from 'react-scan';
import { ThemeManager } from '~/modules/common/theme-manager';

// Scan for React performance issues
scan({
  enabled: env.VITE_REACT_SCAN,
});

// Import tailwindcss
import '~/styling/index.css';

// Boot with i18n & dayjs
import '~/lib/dayjs';
import '~/lib/i18n';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

import router from '~/lib/router';
import { initSentry } from '~/lib/sentry';
import { QueryClientProvider } from '~/query/provider';
import { renderAscii } from '~/utils/ascii';
import { env } from './env';

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
