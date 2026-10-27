import { BirdIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GetPendingMembershipsData } from 'sdk';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { DataTable, rowKeyById } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { useInfiniteRows } from '~/modules/common/data-table/use-infinite-rows';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import type { EnrichedChannel } from '~/modules/entities/types';
import { PendingMembershipsTableBar } from '~/modules/memberships/pending-table/pending-bar';
import { useColumns } from '~/modules/memberships/pending-table/pending-columns';
import { pendingMembershipsQueryOptions } from '~/modules/memberships/query';
import type { PendingMembership } from '~/modules/memberships/types';

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

  const columns = useColumns({ tenantId, organizationId }, channel);
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = pendingMembershipsQueryOptions({ entityId: channel.id, entityType: channel.entityType, tenantId, organizationId, ...search });

  const list = useInfiniteRows(queryOptions);

  return (
    <div className="flex h-full flex-col gap-2">
      <PendingMembershipsTableBar queryKey={queryOptions.queryKey} />
      <DataTable<PendingMembership>
        {...{
          ...list,
          rowKeyGetter: rowKeyById,
          columns,
          enableVirtualization: true,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: <ContentPlaceholder icon={BirdIcon} title="c:no_resource_yet" titleOptions={{ resource: t('c:invites').toLowerCase() }} />,
        }}
      />
    </div>
  );
}
