import { getStepUp } from 'sdk';
import { retryAfterStepUp, type StepUpMethod } from '~/modules/auth/step-up-retry';

/** The re-auth dialog, loaded on first use so the query modules that step up stay free of UI imports. */
const openStepUpDialog = async (methods: StepUpMethod[], section?: string) =>
  (await import('~/modules/auth/step-up-dialog')).openStepUpDialog(methods, section);

/**
 * Runs an account-security action; when the server asks the user to prove it's them first, opens the re-auth dialog
 * and runs the action once more after that. A closed dialog rejects with `StepUpDismissed`. `section` is the id of the
 * page section that asks: an emailed link or a new sign-in comes back there, and without it to the section in view.
 */
export const withStepUp = <T>(action: () => Promise<T>, section?: string) =>
  retryAfterStepUp(action, (methods) => openStepUpDialog(methods, section));

/** Steps up ahead of an action that starts with a ceremony (a passkey or authenticator setup), so it runs once. */
export const ensureStepUp = async () => {
  const { steppedUp, methods } = await getStepUp();
  if (!steppedUp) await openStepUpDialog(methods);
};
