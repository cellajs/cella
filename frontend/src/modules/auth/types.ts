import type { z } from 'zod';
import type { tokenWithDataSchema } from '#/modules/auth/schema';

export type TokenData = z.infer<typeof tokenWithDataSchema>;

export type Step = 'checkEmail' | 'signIn' | 'signUp' | 'inviteOnly' | 'waitlist';
