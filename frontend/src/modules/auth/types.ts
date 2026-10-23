import type { GeneratePasskeyChallengeData, GetTokenDataResponse } from 'sdk';

export type PasskeyChallengeBody = GeneratePasskeyChallengeData['body'];

export type PasskeyVerifyType = Exclude<PasskeyChallengeBody['type'], 'registration'>;

export type TokenData = GetTokenDataResponse;

export type AuthStep = 'checkEmail' | 'signIn' | 'signUp' | 'invitation' | 'waitlist' | 'magicLinkSent';
