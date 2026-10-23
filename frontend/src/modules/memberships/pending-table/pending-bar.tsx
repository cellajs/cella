import type { QueryKey } from '@tanstack/react-query';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

interface PendingMembershipsTableBarProps {
  queryKey: QueryKey;
}

export function PendingMembershipsTableBar({ queryKey }: PendingMembershipsTableBarProps) {
  const total = useListQueryTotal(queryKey);

  return (
    <TableBarContainer>
      <TableCount count={total} label="c:pending_invitation" />
    </TableBarContainer>
  );
}
