import type { InferResponseType } from 'hono';
import type { z } from 'zod/v4';
import type { client } from '~/modules/me/api';
import type { User } from '~/modules/users/types';
import { zGetMeAuthResponse } from '~/openapi-client/zod.gen';

export type MeAuthData = z.infer<typeof zGetMeAuthResponse>['data'];
export type Session = MeAuthData['sessions'][number];

export type MeUser = User;
export type UserMenu = Extract<InferResponseType<(typeof client.menu)['$get']>, { data: unknown }>['data'];
export type UserMenuItem = UserMenu[keyof UserMenu][number];
