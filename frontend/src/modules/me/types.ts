import type { z } from 'zod';
import type { User } from '~/modules/users/types';
import type { GetMenuResponse } from '~/openapi-client';
import type { meAuthDataSchema } from '#/modules/me/schema';

export type Session = MeAuthData['sessions'][number];
export type MeAuthData = z.infer<typeof meAuthDataSchema>;

export type MeUser = User;
export type UserMenu = GetMenuResponse['data'];
export type UserMenuItem = UserMenu[keyof UserMenu][number];
