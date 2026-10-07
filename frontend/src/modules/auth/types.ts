import type { GeneratePasskeyChallengeData, GetTokenDataResponse } from 'sdk';

type PasskeyChallengeType = NonNullable<GeneratePasskeyChallengeData['body']>['type'];

export interface PasskeyCredentialProps {
  type: PasskeyChallengeType;
}

export type TokenData = GetTokenDataResponse;

export type AuthStep = 'checkEmail' | 'signIn' | 'signUp' | 'invitation' | 'inviteOnly' | 'waitlist' | 'mfa' | 'magicLinkSent';
