import type { InferResponseType } from 'hono';
import type { z } from 'zod';
import type { client } from '~/modules/me/api';
import type { User } from '~/modules/users/types';
import type { meAuthInfoSchema } from '#/modules/me/schema';

export type Session = UserAuthInfo['sessions'][number];
export type UserAuthInfo = z.infer<typeof meAuthInfoSchema>;

export type MeUser = User;
export type UserMenu = Extract<InferResponseType<(typeof client.menu)['$get']>, { data: unknown }>['data'];
export type UserMenuItem = UserMenu[keyof UserMenu][number];
