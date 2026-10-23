import { BirdIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GetPendingMembershipsData } from 'sdk';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { useInfiniteRows } from '~/modules/common/data-table/use-infinite-rows';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import type { EnrichedChannel } from '~/modules/entities/types';
import { PendingMembershipsTableBar } from '~/modules/memberships/pending-table/pending-bar';
import { useColumns } from '~/modules/memberships/pending-table/pending-columns';
import { pendingMembershipsQueryOptions } from '~/modules/memberships/query';
import type { PendingMembership } from '~/modules/memberships/types';

function rowKeyGetter(row: PendingMembership) {
  return row.id;
}

type PendingMembershipsSearch = Pick<GetPendingMembershipsData['query'], 'sort' | 'order'>;

export interface PendingMembershipsTableProps {
  channel: EnrichedChannel;
}

export function PendingMembershipsTable({ channel }: PendingMembershipsTableProps) {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<PendingMembershipsSearch>({ saveDataInSearch: false });

  const { sort, order } = search;
  const { tenantId } = channel;
  const organizationId = channelOrganizationId(channel);

  const columns = useColumns({ tenantId, organizationId });
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = pendingMembershipsQueryOptions({ entityId: channel.id, entityType: channel.entityType, tenantId, organizationId, ...search });

  const { rows, isLoading, isFetching, error, hasNextPage, fetchMore } = useInfiniteRows(queryOptions);

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
          error,
          isLoading,
          isFetching,
          hasNextPage,
          fetchMore,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: <ContentPlaceholder icon={BirdIcon} title="c:no_resource_yet" titleProps={{ resource: t('c:invites').toLowerCase() }} />,
        }}
      />
    </div>
  );
}
