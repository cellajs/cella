import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { Themer } from '~/modules/common/themer';

// Import tailwind css
import './styling/tailwind.css';

// Boot with i18n & dayjs
import '~/lib/dayjs';
import '~/lib/i18n';

import { appConfig, type ConfigMode } from 'config';
import { initSentry } from '~/lib/sentry';
import { RouterWrapper } from '~/modules/common/router-wrapper';
import { QueryClientProvider } from '~/query/provider';
import { initTabCoordinator } from '~/query/realtime';
import { addBadgeToFavicon } from '~/utils/add-badge-to-favicon';
import { renderAscii } from '~/utils/ascii';

/**
 * Check if debug mode is enabled via VITE_DEBUG_MODE environment variable.
 * Use this for conditional debug UI, logging, and devtools.
 */
const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// Render ASCII logo in console
renderAscii();

// Add badge to favicon based on config mode
addBadgeToFavicon(appConfig.mode as ConfigMode);

// Initialize Sentry
initSentry();

// Initialize tab coordinator for multi-tab leader election (realtime sync)
initTabCoordinator();

ReactDOM.createRoot(root).render(
  <StrictMode>
    <Themer />
    <QueryClientProvider>
      <RouterWrapper />
    </QueryClientProvider>
  </StrictMode>,
);
