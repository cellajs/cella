import { useInfiniteQuery } from '@tanstack/react-query';
import { BirdIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { zGetPendingMembershipsQuery } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import type { z } from 'zod';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { EnrichedChannel } from '~/modules/entities/types';
import { PendingMembershipsTableBar } from '~/modules/memberships/pending-table/pending-bar';
import { useColumns } from '~/modules/memberships/pending-table/pending-columns';
import { pendingMembershipsQueryOptions } from '~/modules/memberships/query';
import type { PendingMembership } from '~/modules/memberships/types';

const LIMIT = appConfig.requestLimits.pendingMemberships;

function rowKeyGetter(row: PendingMembership) {
  return row.id;
}

const pendingMembershipsSearchSchema = zGetPendingMembershipsQuery.pick({ sort: true, order: true });

type PendingMembershipsSearch = z.infer<typeof pendingMembershipsSearchSchema>;

export interface PendingMembershipsTableProps {
  channel: EnrichedChannel;
}

export function PendingMembershipsTable({ channel }: PendingMembershipsTableProps) {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<PendingMembershipsSearch>({ saveDataInSearch: false });

  const { sort, order } = search;
  const limit = LIMIT;

  const [columns] = useColumns({
    tenantId: channel.tenantId,
    organizationId: channel.organizationId || channel.id,
  });
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = pendingMembershipsQueryOptions({
    entityId: channel.id,
    entityType: channel.entityType,
    tenantId: channel.tenantId,
    organizationId: channel.organizationId || channel.id,
    ...search,
    limit,
  });

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

  const fetchMore = async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <PendingMembershipsTableBar queryKey={queryOptions.queryKey} />
      <DataTable<PendingMembership>
        {...{
          rows,
          rowHeight: 52,
          rowKeyGetter,
          columns,
          enableVirtualization: true,
          limit,
          error,
          isLoading,
          isFetching,
          hasNextPage,
          fetchMore,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder
              icon={BirdIcon}
              title="c:no_resource_yet"
              titleProps={{ resource: t('c:invites').toLowerCase() }}
            />
          ),
        }}
      />
    </div>
  );
}
