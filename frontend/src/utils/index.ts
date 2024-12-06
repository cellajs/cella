import { config } from 'config';
import type { Step } from '~/modules/auth';

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
    (isOAuthEnabled && step === 'check')
  );
};
