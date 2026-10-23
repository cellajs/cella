import { MapleBrowser } from '@maple-dev/browser';
import { appConfig } from 'shared';
import { mapleEnabled } from '~/lib/maple-enabled';

// Errors, traces and web vitals only: no session replay, no cookies or lasting visitor id, and no user id.
if (mapleEnabled) {
  MapleBrowser.init({
    ingestKey: appConfig.maplePublicIngestKey,
    serviceName: `${appConfig.slug}-frontend`,
    environment: appConfig.mode,
    serviceVersion: __APP_VERSION__,
    replay: { enabled: false },
    privacy: { maskAllInputs: true, maskAllText: true, persistVisitorId: false, crossSubdomainCookie: false },
  });
}

/** Reports a React-caught error, which the SDK's global error handlers never see. */
export const reportReactError = (scope: string, error: unknown, componentStack?: string | null) => {
  console.error(`[react:${scope}]`, error, componentStack ? `\n${componentStack}` : '');
  if (mapleEnabled) MapleBrowser.captureException(error, { name: `react.${scope}` });
};
