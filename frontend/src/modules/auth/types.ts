import type { GeneratePasskeyChallengeData, GeneratePasskeyChallengeResponse, GetTokenDataResponse } from 'sdk';

export type PasskeyChallengeBody = GeneratePasskeyChallengeData['body'];

export type PasskeyVerifyType = Exclude<PasskeyChallengeBody['type'], 'registration'>;

/** A passkey a challenge names, with the transports its registration reported. */
export type PasskeyCredential = GeneratePasskeyChallengeResponse['credentials'][number];

export type TokenData = GetTokenDataResponse;

export type TokenInvitation = NonNullable<TokenData['invitation']>;

export type AuthStep = 'checkEmail' | 'signIn' | 'signUp' | 'invitation' | 'waitlist' | 'magicLinkSent';
