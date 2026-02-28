import { useInfiniteQuery } from '@tanstack/react-query';
import { BirdIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import type { RowsChangeData } from '~/modules/common/data-grid';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { useChangeEntityRoleMutation } from '~/modules/memberships/query-mutations';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { OrganizationsTableBar } from '~/modules/organization/table/organizations-bar';
import { useColumns } from '~/modules/organization/table/organizations-columns';
import type { EnrichedOrganization, OrganizationsRouteSearchParams } from '~/modules/organization/types';

const LIMIT = appConfig.requestLimits.organizations;

/** Stable row key getter function - defined outside component to prevent re-renders */
function rowKeyGetter(row: EnrichedOrganization) {
  return row.id;
}

function OrganizationsTable() {
  const { t } = useTranslation();
  const changeRole = useChangeEntityRoleMutation();

  const { search, setSearch } = useSearchParams<OrganizationsRouteSearchParams>({
    from: '/appLayout/system/organizations',
  });

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  const [isCompact, setIsCompact] = useState(false);

  // Build columns
  const [selected, setSelected] = useState<EnrichedOrganization[]>([]);
  const [columns, setColumns] = useColumns(isCompact);
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = organizationsListQueryOptions({ ...search, limit, include: 'counts' });

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

  const onRowsChange = (
    changedRows: EnrichedOrganization[],
    { column, indexes }: RowsChangeData<EnrichedOrganization>,
  ) => {
    if (column.key !== 'role') return;

    for (const index of indexes) {
      const entity = changedRows[index];
      if (!entity.membership?.role) continue;
      changeRole.mutate({ entity, role: entity.membership.role });
    }
  };

  // isFetching already includes next page fetch scenario
  const fetchMore = async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  };

  const onSelectedRowsChange = (value: Set<string>) => {
    if (rows) setSelected(rows.filter((row) => value.has(row.id)));
  };

  const selectedRowIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  // When orgs are selected, lock selection to that tenant (cross-tenant batch delete is not supported)
  const selectedTenantId = selected.length > 0 ? selected[0].tenantId : null;
  const isRowSelectionDisabled = (row: EnrichedOrganization) => !!selectedTenantId && row.tenantId !== selectedTenantId;

  const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns]);

  return (
    <FocusViewContainer data-is-compact={isCompact}>
      <OrganizationsTableBar
        queryKey={queryOptions.queryKey}
        selected={selected}
        columns={columns}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        setColumns={setColumns}
        clearSelection={() => setSelected([])}
        isCompact={isCompact}
        setIsCompact={setIsCompact}
      />
      <DataTable<EnrichedOrganization>
        {...{
          rows: rows as EnrichedOrganization[] | undefined,
          rowHeight: 52,
          onRowsChange,
          rowKeyGetter,
          columns: visibleColumns,
          enableVirtualization: true,
          limit,
          error,
          isLoading,
          isFetching,
          isFiltered: !!q,
          hasNextPage,
          fetchMore,
          selectedRows: selectedRowIds,
          onSelectedRowsChange,
          isRowSelectionDisabled,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder
              icon={BirdIcon}
              title="common:no_resource_yet"
              titleProps={{ resource: t('common:organizations').toLowerCase() }}
            />
          ),
        }}
      />
    </FocusViewContainer>
  );
}

export default OrganizationsTable;
