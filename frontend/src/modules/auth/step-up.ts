import { getStepUp } from 'sdk';
import { retryAfterStepUp, type StepUpMethod } from '~/modules/auth/step-up-retry';

/** The re-auth dialog, loaded on first use so the query modules that step up stay free of UI imports. */
export const openStepUpDialog = async (methods: StepUpMethod[]) =>
  (await import('~/modules/auth/step-up-dialog')).openStepUpDialog(methods);

/**
 * Runs an account-security action; when the server asks the user to prove it's them first, opens the re-auth dialog
 * and runs the action once more after that. A closed dialog rejects with `StepUpDismissed`.
 */
export const withStepUp = <T>(action: () => Promise<T>) => retryAfterStepUp(action, openStepUpDialog);

/** Steps up ahead of an action that starts with a ceremony (a passkey or authenticator setup), so it runs once. */
export const ensureStepUp = async () => {
  const { steppedUp, methods } = await getStepUp();
  if (!steppedUp) await openStepUpDialog(methods);
};
