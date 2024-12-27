import { useParams } from '@tanstack/react-router';
import { queryClient } from '~/lib/router';
import MembersTable from '~/modules/organizations/members-table/';
import { OrganizationMembersRoute } from '~/routes/organizations';
import type { Organization } from '~/types/common';
import { organizationsKeys } from '~/utils/quey-key-factories';

const OrgMembersTable = () => {
  const { idOrSlug } = useParams({ from: OrganizationMembersRoute.id });
  const organization: Organization | undefined = queryClient.getQueryData(organizationsKeys.single(idOrSlug));

  if (!organization) return;
  return <MembersTable entity={organization} />;
};

export default OrgMembersTable;
