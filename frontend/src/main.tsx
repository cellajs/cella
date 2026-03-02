import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { Themer } from '~/modules/common/themer';
import './styling/tailwind.css';
import '~/lib/dayjs';
import '~/lib/i18n';

import { appConfig } from 'shared';
import { renderAscii } from 'shared/ascii';
import { initSentry } from '~/lib/sentry';
import { RouterWrapper } from '~/modules/common/router-wrapper';
import { QueryClientProvider } from '~/query/provider';
import { addBadgeToFavicon } from '~/utils/add-badge-to-favicon';

/**
 * Check if debug mode is enabled via VITE_DEBUG_MODE environment variable.
 * Use this for conditional debug UI, logging, and devtools.
 */
const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// Render ASCII logo in console
renderAscii();

// Add badge to favicon based on config mode
addBadgeToFavicon(appConfig.mode);

// Initialize Sentry
initSentry();

ReactDOM.createRoot(root).render(
  <StrictMode>
    <Themer />
    <QueryClientProvider>
      <RouterWrapper />
    </QueryClientProvider>
  </StrictMode>,
);
