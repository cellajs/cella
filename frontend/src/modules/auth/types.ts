import type { z } from 'zod/v4';
import { zPostAuthCheckTokenByIdResponse } from '~/openapi-client/zod.gen';

export type TokenData = z.infer<typeof zPostAuthCheckTokenByIdResponse>['data'];

export type Step = 'checkEmail' | 'signIn' | 'signUp' | 'inviteOnly' | 'waitlist';
