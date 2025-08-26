import { Bird } from 'lucide-react';
import { forwardRef, memo, useCallback, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import type { PendingInvitationsSearch } from '~/modules/memberships/pending-table/table-wrapper';
import type { pendingInvitationsQueryOptions } from '~/modules/memberships/query';
import type { PendingInvitation } from '~/modules/memberships/types';
import { useDataFromInfiniteQuery } from '~/query/hooks/use-data-from-query';

type BaseDataTableProps = Omit<
  BaseTableProps<PendingInvitation, PendingInvitationsSearch, ReturnType<typeof pendingInvitationsQueryOptions>>,
  'setSelected' | 'searchVars'
> & { limit: number };
const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ queryOptions, columns, limit, sortColumns, setSortColumns }, ref) => {
    const { t } = useTranslation();

    // Query invited members
    const { rows, isLoading, isFetching, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useDataFromInfiniteQuery(queryOptions);

    const fetchMore = useCallback(async () => {
      if (!hasNextPage || isLoading || isFetching || isFetchingNextPage) return;
      await fetchNextPage();
    }, [hasNextPage, isLoading, isFetching, isFetchingNextPage]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => {},
    }));

    return (
      <DataTable<PendingInvitation>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          rowHeight: 52,
          rowKeyGetter: (row) => row.id,
          error,
          isLoading,
          isFetching,
          enableVirtualization: false,
          limit,
          hasNextPage,
          fetchMore,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder icon={Bird} title={t('common:no_resource_yet', { resource: t('common:invites').toLowerCase() })} />,
        }}
      />
    );
  }),
);
export default BaseDataTable;
