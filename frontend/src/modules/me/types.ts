import type { z } from 'zod';
import type { GetUploadTokenData } from '~/api.gen';
import type { zGetMyAuthResponse, zMenuSchema } from '~/api.gen/zod.gen';
import type { User } from '~/modules/users/types';

export type MeAuthData = z.infer<typeof zGetMyAuthResponse>;
export type Session = MeAuthData['sessions'][number];

export type MeUser = User;
export type UserMenu = z.infer<typeof zMenuSchema>;
export type UserMenuItem = UserMenu[keyof UserMenu][number];

export type UploadTockenQuery = GetUploadTokenData['query'] & { public: boolean };
