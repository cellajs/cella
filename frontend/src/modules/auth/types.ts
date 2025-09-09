import type { GetPasskeyChallengeData, ValidateTokenResponse } from '~/api.gen';

type PasskeyChallabgeType = GetPasskeyChallengeData['query']['type'];

export interface PasskeyCredentialProps {
  email?: string;
  type: PasskeyChallabgeType;
}

export type TokenData = ValidateTokenResponse;

export type AuthStep = 'checkEmail' | 'signIn' | 'signUp' | 'inviteOnly' | 'waitlist' | 'error' | 'mfa';
