import type { GetMyAuthResponse, GetUploadTokenData, Menu, User } from '~/api.gen';

export type MeAuthData = GetMyAuthResponse;
export type Session = MeAuthData['sessions'][number];
export type Passkey = MeAuthData['passkeys'][number];

export type MeUser = User;
export type UserMenu = Menu;
export type UserMenuItem = UserMenu[keyof UserMenu][number];

export type UploadTokenQuery = GetUploadTokenData['query'] & { public: boolean };
