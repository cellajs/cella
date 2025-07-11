import { Bird } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import type { PendingInvitationsSearch, PendingInvitationsTableProps } from '~/modules/memberships/pending-table/table-wrapper';
import { pendingInvitationsQueryOptions } from '~/modules/memberships/query';
import type { PendingInvitation } from '~/modules/memberships/types';
import { useDataFromInfiniteQuery } from '~/query/hooks/use-data-from-query';

type BaseDataTableProps = PendingInvitationsTableProps & Omit<BaseTableProps<PendingInvitation, PendingInvitationsSearch>, 'setSelected'>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ entity, columns, searchVars, sortColumns, setSortColumns, setTotal }, ref) => {
    const { t } = useTranslation();

    const entityType = entity.entityType;
    const organizationId = entity.organizationId || entity.id;

    // Extract query variables and set defaults
    const { sort, order, limit } = searchVars;

    // Query invited members
    const { rows, totalCount, isLoading, isFetching, error, fetchNextPage } = useDataFromInfiniteQuery(
      pendingInvitationsQueryOptions({
        idOrSlug: entity.slug,
        entityType,
        orgIdOrSlug: organizationId,
        sort,
        order,
        limit,
      }),
    );

    useEffect(() => setTotal(totalCount), [totalCount]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => {},
    }));

    return (
      <DataTable<PendingInvitation>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount,
          rowHeight: 52,
          rowKeyGetter: (row) => row.id,
          error,
          isLoading,
          isFetching,
          enableVirtualization: false,
          limit,
          fetchMore: fetchNextPage,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder icon={Bird} title={t('common:no_resource_yet', { resource: t('common:invites').toLowerCase() })} />,
        }}
      />
    );
  }),
);
export default BaseDataTable;
