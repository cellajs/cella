import { useInfiniteQuery } from '@tanstack/react-query';
import { appConfig } from 'config';
import { BirdIcon } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { zGetPendingMembershipsData } from '~/api.gen/zod.gen';
import useSearchParams from '~/hooks/use-search-params';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { EntityPage } from '~/modules/entities/types';
import { PendingMembershipsTableBar } from '~/modules/memberships/pending-table/bar';
import { useColumns } from '~/modules/memberships/pending-table/columns';
import { pendingMembershipsQueryOptions } from '~/modules/memberships/query';
import type { PendingMembership } from '~/modules/memberships/types';

const LIMIT = appConfig.requestLimits.pendingMemberships;

const pendingMembershipsSearchSchema = zGetPendingMembershipsData.shape.query.pick({ sort: true, order: true });

type PendingMembershipsSearch = z.infer<typeof pendingMembershipsSearchSchema>;

export interface PendingMembershipsTableProps {
  entity: EntityPage;
}

export const PendingMembershipsTable = ({ entity }: PendingMembershipsTableProps) => {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<PendingMembershipsSearch>({ saveDataInSearch: false });

  // Table state
  const { sort, order } = search;
  const limit = LIMIT;

  // Build columns
  const [columns] = useColumns();
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = pendingMembershipsQueryOptions({
    idOrSlug: entity.slug,
    entityType: entity.entityType,
    orgIdOrSlug: entity.organizationId || entity.id,
    ...search,
    limit,
  });

  // Query invited members
  const {
    data: rows,
    isLoading,
    isFetching,
    error,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    ...queryOptions,
    select: ({ pages }) => pages.flatMap(({ items }) => items),
  });

  // isFetching already includes next page fetch scenario
  const fetchMore = useCallback(async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  }, [hasNextPage, isLoading, isFetching]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <PendingMembershipsTableBar queryKey={queryOptions.queryKey} />
      <DataTable<PendingMembership>
        {...{
          rows,
          rowHeight: 52,
          // Its either a membershipId or tokenId
          rowKeyGetter: (row) => row.membershipId || (row.tokenId as string),
          columns: columns.filter((column) => column.visible),
          enableVirtualization: false,
          limit,
          error,
          isLoading,
          isFetching,
          hasNextPage,
          fetchMore,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder icon={BirdIcon} title={t('common:no_resource_yet', { resource: t('common:invites').toLowerCase() })} />
          ),
        }}
      />
    </div>
  );
};

export default PendingMembershipsTable;
