import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import MembersTable from '~/modules/memberships/members-table/table-wrapper';
import { organizationQueryOptions } from '~/modules/organizations/query';
import { OrganizationMembersRoute } from '~/routes/organizations';

const OrgMembersTable = () => {
  const { idOrSlug } = useParams({ from: OrganizationMembersRoute.id });
  const { data: organization } = useQuery(organizationQueryOptions(idOrSlug));

  if (!organization) return;
  return <MembersTable entity={organization} />;
};

export default OrgMembersTable;
