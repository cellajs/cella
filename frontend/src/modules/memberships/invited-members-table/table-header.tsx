import TableCount from '~/modules/common/data-table/table-count';
import { TableHeaderContainer } from '~/modules/common/data-table/table-header-container';

export const InvitedMembersHeader = ({ total }: { total: number | undefined }) => {
  return (
    <TableHeaderContainer>
      <TableCount count={total} type="invite" />
    </TableHeaderContainer>
  );
};
