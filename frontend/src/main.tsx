import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { Themer } from '~/modules/common/themer';

// Import tailwind css
import './styling/tailwind.css';

// Boot with i18n & dayjs
import '~/lib/dayjs';
import '~/lib/i18n';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

import { appConfig, type ConfigMode } from 'config';
import { initErrorTracker } from '~/lib/error-tracker';
import { RouterWrapper } from '~/modules/common/router-wrapper';
import { QueryClientProvider } from '~/query/provider';
import { addBadgeToFavicon } from '~/utils/add-badge-to-favicon';
import { renderAscii } from '~/utils/ascii';

// Render ASCII logo in console
renderAscii();

// Add badge to favicon based on config mode
addBadgeToFavicon(appConfig.mode as ConfigMode);

// Initialize Error tracker
initErrorTracker();

ReactDOM.createRoot(root).render(
  <StrictMode>
    <Themer />
    <QueryClientProvider>
      <RouterWrapper />
    </QueryClientProvider>
  </StrictMode>,
);
