import type { z } from 'zod/v4';
import type { User } from '~/modules/users/types';
import type { GetUploadTokenData } from '~/openapi-client';
import type { zGetMyAuthResponse, zMenuSchema } from '~/openapi-client/zod.gen';

export type MeAuthData = z.infer<typeof zGetMyAuthResponse>;
export type Session = MeAuthData['sessions'][number];

export type MeUser = User;
export type UserMenu = z.infer<typeof zMenuSchema>;
export type UserMenuItem = UserMenu[keyof UserMenu][number];

export type UploadTockenQuery = GetUploadTokenData['query'] & { public: boolean };
