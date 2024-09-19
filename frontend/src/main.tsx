import '~/index.css';

import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeManager } from '~/modules/common/theme-manager';

import { RouterProvider } from '@tanstack/react-router';
import '~/lib/i18n';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

import { renderAscii } from '~/lib/ascii';
import { queryClient } from '~/lib/router';
import router from '~/lib/router';
import { initSentry } from '~/lib/sentry';

import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

// TODO: tune this and use config to determine if we should use localStorage or sessionStorage
const localStoragePersister = createSyncStoragePersister({
  storage: window.sessionStorage,
});

// Render ASCII logo in console
renderAscii();

// Initialize Sentry
initSentry();

ReactDOM.createRoot(root).render(
  <StrictMode>
    <ThemeManager />
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: localStoragePersister }}>
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  </StrictMode>,
);
