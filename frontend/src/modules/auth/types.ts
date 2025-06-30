import type { z } from 'zod/v4';
import type { zCheckTokenResponse } from '~/api.gen/zod.gen';

export type TokenData = z.infer<typeof zCheckTokenResponse>;

export type Step = 'checkEmail' | 'signIn' | 'signUp' | 'inviteOnly' | 'waitlist';
