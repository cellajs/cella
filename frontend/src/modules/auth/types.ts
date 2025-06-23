import type { z } from 'zod/v4';
import { zCheckTokenResponse } from '~/openapi-client/zod.gen';

export type TokenData = z.infer<typeof zCheckTokenResponse>['data'];

export type Step = 'checkEmail' | 'signIn' | 'signUp' | 'inviteOnly' | 'waitlist';
