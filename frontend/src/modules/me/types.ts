import { appConfig } from 'shared';
import type { GetMyAuthResponse, GetMyInvitationsResponse, GetUploadTokenData, User } from '~/api.gen';
import type { ContextEntityData } from '~/modules/entities/types';

export type MeAuthData = GetMyAuthResponse;
export type Session = MeAuthData['sessions'][number];
export type Passkey = MeAuthData['passkeys'][number];

export type MeUser = User;

/** Extracts only the top-level entityType values from menuStructure (excludes subentityType) */
type MenuEntityType = (typeof appConfig.menuStructure)[number]['entityType'];
export type UserMenu = Record<MenuEntityType, UserMenuItem[]>;

export type ContextEntityDataWithMembership = Omit<ContextEntityData, 'membership'> & {
  membership: NonNullable<ContextEntityData['membership']>;
};
export type UserMenuItem = ContextEntityDataWithMembership & { submenu?: ContextEntityDataWithMembership[] };

export type UploadTokenQuery = GetUploadTokenData['query'] & { public: boolean };

export type Invitation = GetMyInvitationsResponse['items'][number];
