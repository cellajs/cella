import type { ContextEntity } from 'config';
import type { z } from 'zod';
import type { membersSchema } from '#/modules/general/schema';
import type { membershipInfoSchema, membershipSchema } from '#/modules/memberships/schema';

export type Member = z.infer<typeof membersSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type MinimumMembershipInfo = z.infer<typeof membershipInfoSchema>;

export type MinimumEntityItem = {
  id: string;
  entity: ContextEntity;
  slug: string;
  name: string;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
};

export type EntityPage = MinimumEntityItem & {
  membership: MinimumMembershipInfo | null;
  organizationId?: string | null;
  parentEntity?: { idOrSlug: string; entity: ContextEntity };
};
