import { MenuSection } from 'config';
import type { GetMyAuthResponse, GetMyInvitationsResponse, GetUploadTokenData, User } from '~/api.gen';
import type { ContextEntityData } from '~/modules/entities/types';

export type MeAuthData = GetMyAuthResponse;
export type Session = MeAuthData['sessions'][number];
export type Passkey = MeAuthData['passkeys'][number];

export type MeUser = User;
export type UserMenu = Record<MenuSection['entityType'], UserMenuItem[]>;

export type ContextEntityDataWithMembership = Omit<ContextEntityData, 'membership'> & { membership: NonNullable<ContextEntityData['membership']> };
export type UserMenuItem = ContextEntityDataWithMembership & { submenu?: ContextEntityDataWithMembership[] };

export type UploadTokenQuery = GetUploadTokenData['query'] & { public: boolean };

export type Invitation = GetMyInvitationsResponse['items'][number];
