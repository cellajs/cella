import { useParams } from '@tanstack/react-router';
import { queryClient } from '~/lib/router';
import MembersTable from '~/modules/memberships/members-table/';
import { organizationsKeys } from '~/query/query-key-factories';
import { OrganizationMembersRoute } from '~/routes/organizations';
import type { Organization } from '~/types/common';

const OrgMembersTable = () => {
  const { idOrSlug } = useParams({ from: OrganizationMembersRoute.id });
  const organization: Organization | undefined = queryClient.getQueryData(organizationsKeys.single(idOrSlug));

  if (!organization) return;
  return <MembersTable entity={organization} />;
};

export default OrgMembersTable;
