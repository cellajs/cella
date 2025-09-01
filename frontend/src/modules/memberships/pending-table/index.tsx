import { useInfiniteQuery } from '@tanstack/react-query';
import { appConfig } from 'config';
import { Bird } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { EntityPage } from '~/modules/entities/types';
import { PendingInvitationsTableBar } from '~/modules/memberships/pending-table/bar';
import { useColumns } from '~/modules/memberships/pending-table/columns';
import { pendingInvitationsQueryOptions } from '~/modules/memberships/query';
import type { PendingInvitation } from '~/modules/memberships/types';
import type { pendingInvitationsSearchSchema } from '~/routes/organizations';

const LIMIT = appConfig.requestLimits.pendingInvitations;

type PendingInvitationsSearch = z.infer<typeof pendingInvitationsSearchSchema>;

export interface PendingInvitationsTableProps {
  entity: EntityPage;
}

export const MembershipInvitationsTable = ({ entity }: PendingInvitationsTableProps) => {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<PendingInvitationsSearch>({ saveDataInSearch: false });

  // Table state
  const { sort, order } = search;
  const limit = LIMIT;

  // Build columns
  const [columns] = useColumns();
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = pendingInvitationsQueryOptions({
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
      <PendingInvitationsTableBar queryKey={queryOptions.queryKey} />
      <DataTable<PendingInvitation>
        {...{
          rows,
          rowHeight: 52,
          rowKeyGetter: (row) => row.id,
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
          NoRowsComponent: <ContentPlaceholder icon={Bird} title={t('common:no_resource_yet', { resource: t('common:invites').toLowerCase() })} />,
        }}
      />
    </div>
  );
};

export default MembershipInvitationsTable;
