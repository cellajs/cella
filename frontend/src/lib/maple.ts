/**
 * Maple.dev browser observability (errors + session replay + tracing).
 *
 * All-in on the Maple SDK: it OWNS tracing here — its provider registers
 * globally, its fetch instrumentation creates network spans, and every span
 * carries the replay session id, so trace↔replay linking is bidirectional.
 * The dev-only local tracer in lib/otel.ts registers only when this module
 * is inactive (see lib/maple-enabled.ts); exactly one provider per env.
 *
 * ⚠ Trial gate #1 (.todos/21): verify the SDK's fetch instrumentation
 * propagates the W3C traceparent header to the backend origin — the
 * browser→backend trace join (and the trace_id-as-logId story) depends on it.
 * Fallback if it doesn't: tracing.instrumentFetch: false + register OTel's
 * stock FetchInstrumentation against the SDK's (global) provider.
 *
 * Captures uncaught errors, unhandled rejections, console output, network
 * failures and rrweb session replay. Ships with the browser-safe *public*
 * ingest key (same CSP origin as before).
 *
 * Privacy: inputs AND rendered text are masked before anything leaves the
 * browser (multi-tenant content must not end up in replays by default).
 * Enabled outside development; dev opt-in via VITE_DEBUG_MODE.
 */
import { MapleBrowser } from '@maple-dev/browser';
import { appConfig } from 'shared';
import { useUserStore } from '~/modules/user/user-store';
import { mapleEnabled } from './maple-enabled';

if (mapleEnabled) {
  MapleBrowser.init({
    ingestKey: appConfig.maplePublicIngestKey,
    serviceName: `${appConfig.slug}-frontend`,
    environment: appConfig.mode,
    serviceVersion: __APP_VERSION__,
    replay: { sampleRate: 1 },
    privacy: { maskAllInputs: true, maskAllText: true },
  });

  // Attach the (opaque) user id to the session once known; safe to call repeatedly.
  const identify = (userId?: string) => userId && MapleBrowser.identify(userId);
  identify(useUserStore.getState().user?.id);
  useUserStore.subscribe((state, prev) => {
    if (state.user?.id && state.user.id !== prev.user?.id) identify(state.user.id);
  });
}

/**
 * Structured funnel for errors caught by React (boundaries/root). console.error
 * is the SDK's capture path (it wraps console), so this both keeps local
 * visibility and lands the error on the Maple session timeline.
 */
export const reportReactError = (scope: string, error: unknown, componentStack?: string | null) => {
  console.error(`[react:${scope}]`, error, componentStack ? `\n${componentStack}` : '');
};
