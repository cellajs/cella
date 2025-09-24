import type { CheckTokenResponse, CreatePasskeyChallengeData } from '~/api.gen';

type PasskeyChallengeType = NonNullable<CreatePasskeyChallengeData['body']>['type'];

export interface PasskeyCredentialProps {
  email?: string;
  type: PasskeyChallengeType;
}

export type TokenData = CheckTokenResponse;

export type AuthStep = 'checkEmail' | 'signIn' | 'signUp' | 'inviteOnly' | 'waitlist' | 'error' | 'mfa';
