import type { GetUploadTokenData, ListMyInvitationsResponse, MeAuthData, MembershipBase, User } from 'sdk';
import type { MenuSection } from 'shared';
import type { EnrichedChannel } from '~/modules/entities/types';

export type Session = MeAuthData['sessions'][number];
export type Passkey = MeAuthData['passkeys'][number];

export type MeUser = User;

/** Extracts only the top-level entityType values from menuStructure (excludes subentityType) */
type MenuEntityType = MenuSection['entityType'];
export type UserMenu = Record<MenuEntityType, UserMenuItem[]>;

/** A channel the user is a member of, joined with that membership when the menu is built. */
export type UserMenuItem = EnrichedChannel & { membership: MembershipBase; submenu?: UserMenuItem[] };

export type UploadTokenQuery = GetUploadTokenData['query'];

export type Invitation = ListMyInvitationsResponse['results'][number];
