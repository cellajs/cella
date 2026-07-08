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

  // Attach the opaque user id to the session once known.
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
