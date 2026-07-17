import type { QueryKey } from '@tanstack/react-query';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

export const PendingMembershipsTableBar = ({ queryKey }: { queryKey: QueryKey }) => {
  const total = useListQueryTotal(queryKey);

  return (
    <TableBarContainer offsetTop={0}>
      <TableCount count={total} label="c:pending_invitation" />
    </TableBarContainer>
  );
};
