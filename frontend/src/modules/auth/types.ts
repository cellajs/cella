import type { GetPasskeyChallengeData, ValidateTokenResponse } from '~/api.gen';

type PasskeyChallengeType = NonNullable<GetPasskeyChallengeData['body']>['type'];

export interface PasskeyCredentialProps {
  email?: string;
  type: PasskeyChallengeType;
}

export type TokenData = ValidateTokenResponse;

export type AuthStep = 'checkEmail' | 'signIn' | 'signUp' | 'inviteOnly' | 'waitlist' | 'error' | 'mfa';
