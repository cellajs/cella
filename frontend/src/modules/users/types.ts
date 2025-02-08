import type { InferResponseType } from 'hono';
import type { z } from 'zod';
import type { meClient } from '~/modules/users/api';
import type { meAuthInfoSchema } from '#/modules/me/schema';
import type { limitedUserSchema, userSchema } from '#/modules/users/schema';

export type User = z.infer<typeof userSchema>;
export type LimitedUser = z.infer<typeof limitedUserSchema>;
export type Session = UserAuthInfo['sessions'][number];
type UserAuthInfo = z.infer<typeof meAuthInfoSchema>;

// TODO store User and auth info separately?
export type MeUser = User & UserAuthInfo;
export type UserMenu = Extract<InferResponseType<(typeof meClient.menu)['$get']>, { data: unknown }>['data'];
export type UserMenuItem = UserMenu[keyof UserMenu][number];
