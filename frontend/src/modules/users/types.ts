import type { EnabledOauthProvider } from 'config';
import type { InferResponseType } from 'hono';
import type { z } from 'zod';
import type { meClient } from '~/modules/users/api';
import type { limitedUserSchema, userSchema } from '#/modules/users/schema';

export type User = z.infer<typeof userSchema>;
export type LimitedUser = z.infer<typeof limitedUserSchema>;

export type Session = Extract<InferResponseType<(typeof meClient.index)['$get']>, { data: unknown }>['data']['sessions'][number];
export type MeUser = User & { sessions: Session[]; passkey: boolean; oauth: EnabledOauthProvider[] };
export type UserMenu = Extract<InferResponseType<(typeof meClient.menu)['$get']>, { data: unknown }>['data'];
export type UserMenuItem = UserMenu[keyof UserMenu][number];
