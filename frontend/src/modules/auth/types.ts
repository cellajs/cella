import type { RefreshTokenResponse } from '~/api.gen';

export type TokenData = RefreshTokenResponse;

export type AuthStep = 'checkEmail' | 'signIn' | 'signUp' | 'inviteOnly' | 'waitlist' | 'error';
