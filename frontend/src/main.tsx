import '~/lib/zod-config'; // Must run before shared and sdk build their schemas: zod reads jitless as a schema is built
import '~/lib/history-bind'; // Must run before otel/maple/router: they all patch history
import { LucideProvider } from 'lucide-react';
import { MotionConfig } from 'motion/react';
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
import { ApiError } from '~/lib/api';
import { createClientConfig } from '~/lib/api-client';
import { reportReactError, reportRejectedResponse } from '~/lib/maple';
import { AppRouter } from '~/modules/common/app/app-router';
import { assertSurfaces } from '~/modules/common/page/tab-nav';
import { ReloadPrompt } from '~/modules/common/reload-prompt';
import { ToasterProvider } from '~/modules/common/toaster/toaster-provider';
import { PersistedQueryProvider } from '~/query/persisted-query-provider';
import { checkForUpdate, reloadOntoWaitingWorker } from '~/utils/app-update';
import { canonicalOriginUrl, leaveForCanonicalOrigin } from '~/utils/canonical-origin';
import { initFaviconBadge } from '~/utils/init-favicon-badge';
import { initInputModality } from '~/utils/input-modality';
import { initTextEditingObserver } from '~/utils/text-editing-observer';
import { initViewportObserver } from '~/utils/viewport-observer';

client.setConfig(createClientConfig());
// An error after an ok response is the SDK's response check refusing the body: report it, then rethrow it unchanged.
client.interceptors.error.use((error, response, request) => {
  if (response?.ok) reportRejectedResponse(error, request ? new URL(request.url).pathname : '', response.status);
  // A refused body or a server error can mean a newer release is out: look for it now, not at the next periodic check.
  // A failed status reaches here as the ApiError the client's fetch threw, with no response.
  if (response?.ok || (error instanceof ApiError && error.status >= 500)) void checkForUpdate();
  return error;
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// Both the module registry and the route tree are populated by now, so every listed id can be checked.
assertSurfaces();

renderAscii();

initFaviconBadge(appConfig.mode);

initViewportObserver();
initTextEditingObserver();

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
} else if (!(await reloadOntoWaitingWorker())) {
  ReactDOM.createRoot(root, {
    onUncaughtError: (error, errorInfo) => reportReactError('uncaught', error, errorInfo.componentStack),
    onCaughtError: (error, errorInfo) => reportReactError('boundary', error, errorInfo.componentStack),
  }).render(
    <StrictMode>
      <Themer />
      {/* With reduced motion asked for, motion/react jumps height, position, transform and layout changes; opacity still fades. */}
      <MotionConfig reducedMotion="user">
        {/* size="1rem" mirrors the :where(svg.lucide) default in the width/height attributes; LucideConfig types size as a number. */}
        <LucideProvider size={'1rem' as unknown as number} strokeWidth={appConfig.theme.strokeWidth}>
          <PersistedQueryProvider>
            <AppRouter />
            {/* Outside the router: the root error page replaces the root route's component, and both outlive it */}
            <ReloadPrompt />
            <ToasterProvider />
          </PersistedQueryProvider>
        </LucideProvider>
      </MotionConfig>
    </StrictMode>,
  );
}
