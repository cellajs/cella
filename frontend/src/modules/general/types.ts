import type { ContextEntity } from 'config';
import type { MinimumMembershipInfo } from '~/modules/memberships/types';

export type MinimumEntityItem = {
  id: string;
  entity: ContextEntity;
  slug: string;
  name: string;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
};

export type EntityPage = MinimumEntityItem & {
  organizationId?: string | null;
  membership: MinimumMembershipInfo | null;
};
