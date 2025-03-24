import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { Themer } from '~/modules/common/themer';

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

// Render ASCII logo in console
renderAscii();

// Initialize Sentry if online
if (navigator.onLine) initSentry();

ReactDOM.createRoot(root).render(
  <StrictMode>
    <Themer />
    <QueryClientProvider>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
