import type { ValidateTokenResponse } from '~/api.gen';

export type TokenData = ValidateTokenResponse;

export type AuthStep = 'checkEmail' | 'signIn' | 'signUp' | 'inviteOnly' | 'waitlist' | 'error';
