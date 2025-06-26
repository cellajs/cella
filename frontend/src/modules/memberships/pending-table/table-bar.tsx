import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';

export const PendingInvitationsTableBar = ({ total }: { total: number | undefined }) => {
  return (
    <TableBarContainer>
      <TableCount count={total} type="invite" />
    </TableBarContainer>
  );
};
