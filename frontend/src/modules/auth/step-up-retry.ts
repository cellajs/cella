import type { GetStepUpResponse } from 'sdk';
import { ApiError } from '~/lib/api';

export type StepUpMethod = GetStepUpResponse['methods'][number];

/** The user closed the re-auth dialog without proving it's them. */
export class StepUpDismissed extends Error {
  constructor() {
    super('Step-up dismissed');
    this.name = 'StepUpDismissed';
  }
}

/** Whether the server refused an action until the user proves it's them again. */
export const isStepUpRequired = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.type === 'step_up_required';

const methodsOf = (error: ApiError): StepUpMethod[] => {
  const methods = error.meta?.methods;
  return Array.isArray(methods) ? methods.filter((method): method is StepUpMethod => typeof method === 'string') : [];
};

/**
 * Runs an account-security action; when the server asks the user to prove it's them first, `stepUp` gets what the
 * user can offer, and once it resolves the action runs one more time. Every other failure, and a rejected `stepUp`,
 * reaches the caller.
 */
export const retryAfterStepUp = async <T>(
  action: () => Promise<T>,
  stepUp: (methods: StepUpMethod[]) => Promise<void>,
): Promise<T> => {
  try {
    return await action();
  } catch (error) {
    if (!isStepUpRequired(error)) throw error;
    await stepUp(methodsOf(error));
    return action();
  }
};
