import type { z } from 'zod';
import type { zRefreshTokenResponse } from '~/api.gen/zod.gen';

export type TokenData = z.infer<typeof zRefreshTokenResponse>;

export type AuthStep = 'checkEmail' | 'signIn' | 'signUp' | 'inviteOnly' | 'waitlist' | 'error';
