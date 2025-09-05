import { appConfig } from 'config';
import type { AuthStep } from '~/modules/auth/types';

export const shouldShowDivider = (step: AuthStep): boolean => {
  const enabledStrategies: readonly string[] = appConfig.enabledAuthStrategies;

  // Get enabled authentication strategies
  const isOAuthEnabled = enabledStrategies.includes('oauth');
  const isPasswordEnabled = enabledStrategies.includes('password');
  const isPasskeyEnabled = enabledStrategies.includes('passkey');

  return (
    // Case 1: Password is enabled with either (passkey + user hasPasskey) or OAuth
    (isPasswordEnabled && (isPasskeyEnabled || isOAuthEnabled)) ||
    // Case 2: OAuth are enabled, and the current step is 'check'
    (isOAuthEnabled && step === 'checkEmail')
  );
};
