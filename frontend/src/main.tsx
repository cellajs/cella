import '~/lib/history-bind'; // Must run before otel/maple/router: they all patch history
import { LucideProvider } from 'lucide-react';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { Themer } from '~/modules/common/themer';
import '~/styling/tailwind.css';
import '~/lib/dayjs';
import '~/lib/i18n';
import '~/lib/otel';
import '~/modules'; // Composition root: registers every frontend module before first render
import { client } from 'sdk/client.gen';
import { appConfig } from 'shared';
import { renderAscii } from 'shared/utils/ascii';
import { createClientConfig } from '~/lib/api-client';
import { reportReactError } from '~/lib/maple';
import { AppRouter } from '~/modules/common/app/app-router';
import { assertSurfaces } from '~/modules/common/page/tab-nav';
import { QueryClientProvider } from '~/query/provider';
import { canonicalOriginUrl, leaveForCanonicalOrigin } from '~/utils/canonical-origin';
import { initFaviconBadge } from '~/utils/init-favicon-badge';
import { initInputModality } from '~/utils/input-modality';
import { initViewportObserver } from '~/utils/viewport-observer';

client.setConfig(createClientConfig());

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// Both the module registry and the route tree are populated by now, so every listed id can be checked.
assertSurfaces();

renderAscii();

initFaviconBadge(appConfig.mode);

initViewportObserver();

initInputModality();

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

const canonicalUrl = canonicalOriginUrl(window.location, appConfig.frontendUrl, appConfig.mode);

if (canonicalUrl) {
  // No render, so this host registers no service worker of its own.
  void leaveForCanonicalOrigin(canonicalUrl);
} else {
  ReactDOM.createRoot(root, {
    onUncaughtError: (error, errorInfo) => reportReactError('uncaught', error, errorInfo.componentStack),
    onCaughtError: (error, errorInfo) => reportReactError('boundary', error, errorInfo.componentStack),
  }).render(
    <StrictMode>
      <Themer />
      {/* size="1rem" mirrors the :where(svg.lucide) default in the width/height attributes; LucideConfig types size as a number. */}
      <LucideProvider size={'1rem' as unknown as number} strokeWidth={appConfig.theme.strokeWidth}>
        <QueryClientProvider>
          <AppRouter />
        </QueryClientProvider>
      </LucideProvider>
    </StrictMode>,
  );
}
