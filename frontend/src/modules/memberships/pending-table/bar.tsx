import type { QueryKey } from '@tanstack/react-query';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { useInfiniteQueryTotal } from '~/query/hooks/use-infinite-query-total';

export const PendingInvitationsTableBar = ({ queryKey }: { queryKey: QueryKey }) => {
  const total = useInfiniteQueryTotal(queryKey);

  return (
    <TableBarContainer>
      <TableCount count={total} label="common:invite" />
    </TableBarContainer>
  );
};
