import { MenuSection } from 'config';
import type { GetMyAuthResponse, GetMyInvitationsResponse, GetUploadTokenData, User } from '~/api.gen';
import type { EntityData } from '~/modules/entities/types';

export type MeAuthData = GetMyAuthResponse;
export type Session = MeAuthData['sessions'][number];
export type Passkey = MeAuthData['passkeys'][number];

export type MeUser = User;
export type UserMenu = Record<MenuSection['entityType'], UserMenuItem[]>;

export type EntityDataWithMembership = Omit<EntityData, 'membership'> & { membership: NonNullable<EntityData['membership']> };
export type UserMenuItem = EntityDataWithMembership & { submenu?: EntityDataWithMembership[] };

export type UploadTokenQuery = GetUploadTokenData['query'] & { public: boolean };

export type Invitation = GetMyInvitationsResponse['items'][number];
