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

/**
 * Reports an ok API response the SDK refused because it does not match the spec: a handler bug, or an older client
 * meeting a newer server. The global query error handler shows only network errors and ApiErrors, so this is its one trace.
 */
export const reportRejectedResponse = (error: unknown, path: string, status: number) => {
  console.error('[api] response does not match the spec', { path, status }, error);
  if (mapleEnabled) MapleBrowser.captureException(error, { name: 'api.response_rejected', attributes: { path, status } });
};

/** Reports a React-caught error, which the SDK's global error handlers never see. */
export const reportReactError = (scope: string, error: unknown, componentStack?: string | null) => {
  console.error(`[react:${scope}]`, error, componentStack ? `\n${componentStack}` : '');
  if (mapleEnabled) MapleBrowser.captureException(error, { name: `react.${scope}` });
};
