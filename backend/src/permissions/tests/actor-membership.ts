import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/**
 * The actor's membership of a channel, holding only the fields a permission decision reads. A synthetic hierarchy's
 * channel types are not the app's, so the row is cast.
 */
export const actorMembership = (channelType: string, channelId: string, role: string, organizationId: string): MembershipBaseModel =>
  ({
    id: `mem-${channelType}-${channelId}-${role}`,
    userId: 'actor',
    channelType,
    channelId,
    organizationId,
    role,
  }) as unknown as MembershipBaseModel;
