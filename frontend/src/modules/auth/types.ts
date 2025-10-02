import type { GeneratePasskeyChallengeData, GetTokenDataResponse } from '~/api.gen';

type PasskeyChallengeType = NonNullable<GeneratePasskeyChallengeData['body']>['type'];

export interface PasskeyCredentialProps {
  email?: string;
  type: PasskeyChallengeType;
}

export type TokenData = GetTokenDataResponse;

export type AuthStep = 'checkEmail' | 'signIn' | 'signUp' | 'inviteOnly' | 'waitlist' | 'mfa';
