import { getStepUp } from 'sdk';
import { retryAfterStepUp, type StepUpMethod } from '~/modules/auth/step-up-retry';

let pending: Promise<void> | null = null;

/**
 * The re-auth dialog, loaded on first use so the query modules that step up stay free of UI imports. An action that
 * asks while one is open waits for the same dialog, so one proof lets every waiting action run again.
 */
const openStepUpDialog = (methods: StepUpMethod[], section?: string) => {
  pending ??= import('~/modules/auth/step-up-dialog')
    .then((module) => module.openStepUpDialog(methods, section))
    .finally(() => {
      pending = null;
    });
  return pending;
};

/**
 * `retryAfterStepUp` through the re-auth dialog; dismissing it fails the action with `StepUpDismissed`. `section` is the
 * id of the page section that asks: an emailed link or a new sign-in returns to it, or without one to the section in view.
 */
export const withStepUp = <T>(action: () => Promise<T>, section?: string) =>
  retryAfterStepUp(action, (methods) => openStepUpDialog(methods, section));

/** Steps up ahead of an action that starts with a ceremony (a passkey or authenticator setup), so it runs once. */
export const ensureStepUp = async () => {
  const { steppedUp, methods } = await getStepUp();
  if (!steppedUp) await openStepUpDialog(methods);
};
