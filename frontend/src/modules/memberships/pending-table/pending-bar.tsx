import type { QueryKey } from '@tanstack/react-query';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { useInfiniteQueryTotal } from '~/query/basic';

export const PendingMembershipsTableBar = ({ queryKey }: { queryKey: QueryKey }) => {
  const total = useInfiniteQueryTotal(queryKey);

  return (
    <TableBarContainer>
      <TableCount count={total} label="common:invite" />
    </TableBarContainer>
  );
};
