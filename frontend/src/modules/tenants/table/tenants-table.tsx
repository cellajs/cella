import { useInfiniteQuery } from '@tanstack/react-query';
import { BuildingIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import type { Tenant } from '~/api.gen';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { tenantsListQueryOptions } from '~/modules/tenants/query';
import type { TenantsRouteSearchParams } from '~/modules/tenants/search-params-schema';
import { TenantsTableBar } from '~/modules/tenants/table/tenants-bar';
import { useColumns } from '~/modules/tenants/table/tenants-columns';

const LIMIT = appConfig.requestLimits.users; // Use users limit as fallback

/** Stable row key getter function */
function rowKeyGetter(row: Tenant) {
  return row.id;
}

// TODO backend should not send `public` tenant at all.

/**
 * Tenants table for system admin panel.
 * Allows viewing and managing all tenants in the system.
 */
function TenantsTable() {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<TenantsRouteSearchParams>({ from: '/appLayout/system/tenants' });

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  // Build columns
  const [selected, setSelected] = useState<Tenant[]>([]);
  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = tenantsListQueryOptions({ ...search, limit });
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

  // Memoize callback to prevent unnecessary re-renders
  const onSelectedRowsChange = useCallback(
    (value: Set<string>) => {
      if (rows) setSelected(rows.filter((row) => value.has(row.id)));
    },
    [rows],
  );

  const selectedRowIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <TenantsTableBar
        queryKey={queryOptions.queryKey}
        selected={selected}
        columns={columns}
        setColumns={setColumns}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        clearSelection={() => setSelected([])}
      />
      <DataTable<Tenant>
        {...{
          rows,
          rowHeight: 52,
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
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder
              icon={BuildingIcon}
              title="common:no_resource_yet"
              titleProps={{ resource: t('common:tenants').toLowerCase() }}
            />
          ),
        }}
      />
    </div>
  );
}

export default TenantsTable;
