import type { z } from 'zod';
import type { checkTokenSchema } from '#/modules/auth/schema';

export type TokenData = z.infer<typeof checkTokenSchema>;

export type Step = 'checkEmail' | 'signIn' | 'signUp' | 'inviteOnly' | 'waitlist';
