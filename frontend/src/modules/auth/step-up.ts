import { getStepUp } from 'sdk';
import { retryAfterStepUp, type StepUpMethod, type StepUpTier } from '~/modules/auth/step-up-retry';

let pending: Promise<void> | null = null;

/**
 * The re-auth dialog, loaded on first use so the query modules that step up stay free of UI imports. An action that
 * asks while one is open waits for the same dialog, so one proof lets every waiting action run again.
 */
const openStepUpDialog = (methods: StepUpMethod[]) => {
  pending ??= import('~/modules/auth/step-up-dialog')
    .then((module) => module.openStepUpDialog(methods))
    .finally(() => {
      pending = null;
    });
  return pending;
};

/** `retryAfterStepUp` through the re-auth dialog; dismissing it fails the action with `StepUpDismissedError`. */
export const withStepUp = <T>(action: () => Promise<T>) => retryAfterStepUp(action, openStepUpDialog);

/**
 * Steps up for `tier` ahead of an action that starts with a ceremony or a form (a passkey or authenticator setup, a
 * new API key), so the user proves it once, before the ceremony or the typing.
 */
export const ensureStepUp = async (tier: StepUpTier) => {
  const { steppedUp, methods } = await getStepUp({ query: { tier } });
  if (!steppedUp) await openStepUpDialog(methods);
};
