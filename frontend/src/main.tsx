import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { Themer } from '~/modules/common/themer';
import './styling/tailwind.css';
import '~/lib/dayjs';
import '~/lib/i18n';

import { client } from 'sdk/client.gen';
import { appConfig } from 'shared';
import { renderAscii } from 'shared/ascii';
import { createClientConfig } from '~/api-client';
import { AppRouter } from '~/modules/common/app/app-router';
import { QueryClientProvider } from '~/query/provider';
import { initFaviconBadge } from '~/utils/init-favicon-badge';

// Configure the SDK client with runtime settings (credentials, error handling, etc.)
client.setConfig(createClientConfig());

/**
 * Check if debug mode is enabled via VITE_DEBUG_MODE environment variable.
 * Use this for conditional debug UI, logging, and devtools.
 */
const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// Render ASCII logo in console
renderAscii();

// Add badge to favicon based on config mode
initFaviconBadge(appConfig.mode);

// In dev server mode, unregister any lingering service workers left by `pnpm offline`.
// `import.meta.env.DEV` is true only for the Vite dev server, not for `vite preview`.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
      console.debug('[Dev] Unregistered lingering service worker:', registration.scope);
    }
  });
}

ReactDOM.createRoot(root).render(
  <StrictMode>
    <Themer />
    <QueryClientProvider>
      <AppRouter />
    </QueryClientProvider>
  </StrictMode>,
);
