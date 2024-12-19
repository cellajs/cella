import { organizationQueryOptions } from '~/modules/organizations/organization-page';
import type { UserMenuItem } from '~/types/common';

import { attachmentsQueryOptions } from '~/modules/attachments/attachments-table/helpers/query-options';
import { membersQueryOptions } from '~/modules/organizations/members-table/helpers/query-options';

export const queriesToMap = (item: UserMenuItem) => {
  const orgIdOrSlug = item.organizationId ?? item.id;
  switch (item.entity) {
    case 'organization':
      return [
        organizationQueryOptions(item.slug),
        membersQueryOptions({
          idOrSlug: item.slug,
          orgIdOrSlug,
          entityType: item.entity,
        }),
        attachmentsQueryOptions({ orgIdOrSlug }),
      ];
  }
};
