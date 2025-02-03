import { config } from 'config';
import type { Step } from '~/modules/auth/auth-steps';

export const shouldShowDivider = (hasPasskey: boolean, step: Step): boolean => {
  const enabledStrategies: readonly string[] = config.enabledAuthenticationStrategies;

  // Get enabled authentication strategies
  const isOAuthEnabled = enabledStrategies.includes('oauth');
  const isPasswordEnabled = enabledStrategies.includes('password');
  const isPasskeyEnabled = enabledStrategies.includes('passkey');

  return (
    // Case 1: Password is enabled with either (Passkey + user hasPasskey) or OAuth
    (isPasswordEnabled && ((isPasskeyEnabled && hasPasskey) || isOAuthEnabled)) ||
    // Case 2: OAuth are enabled, and the current step is 'check'
    (isOAuthEnabled && step === 'checkEmail')
  );
};

/**
 * Compares two arrays of objects by their 'id' property and checks if they have the same elements.
 *
 * @param arr1 - First array to compare.
 * @param arr2 - Second array to compare.
 * @returns Boolean(if arrays have same elements).
 */
export const arraysHaveSameElements = (arr1: { id: string }[], arr2: { id: string }[]) => {
  if (arr1.length !== arr2.length) return false;

  const ids1 = new Set(arr1.map((item) => item.id));
  const ids2 = new Set(arr2.map((item) => item.id));

  if (ids1.size !== ids2.size) return false;

  for (const id of ids1) if (!ids2.has(id)) return false;

  return true;
};
