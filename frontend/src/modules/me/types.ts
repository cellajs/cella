import { appConfig } from 'shared';
import type { GetMyInvitationsResponse, GetUploadTokenData, MeAuthData, User } from '~/api.gen';
import type { EnrichedContextEntity, WithRequired } from '~/modules/entities/types';

export type Session = MeAuthData['sessions'][number];
export type Passkey = MeAuthData['passkeys'][number];

export type MeUser = User;

/** Extracts only the top-level entityType values from menuStructure (excludes subentityType) */
type MenuEntityType = (typeof appConfig.menuStructure)[number]['entityType'];
export type UserMenu = Record<MenuEntityType, UserMenuItem[]>;

export type UserMenuItem = WithRequired<EnrichedContextEntity, 'membership'> & { submenu?: UserMenuItem[] };

export type UploadTokenQuery = GetUploadTokenData['query'] & { public: boolean };

export type Invitation = GetMyInvitationsResponse['items'][number];
