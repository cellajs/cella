import type { EntityPage, MinimumMembershipInfo } from '~/types/common';
import MembersTable from '.';
import FilterBarSearch from './filter-bar';

const MembersTableWrap = ({ entity }: { entity: EntityPage & { membership: MinimumMembershipInfo | null } }) => {
  return (
    <MembersTable entity={entity}>
      <FilterBarSearch entityType={entity.entity} />
    </MembersTable>
  );
};
export default MembersTableWrap;
