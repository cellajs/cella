import { BirdIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import type { RowsChangeData } from '~/modules/common/data-grid';
import { DataTable } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { useInfiniteRows } from '~/modules/common/data-table/use-infinite-rows';
import { useRowSelection } from '~/modules/common/data-table/use-row-selection';
import { useChangeEntityRoleMutation } from '~/modules/memberships/query-mutations';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { OrganizationsTableBar } from '~/modules/organization/table/organizations-bar';
import { useColumns } from '~/modules/organization/table/organizations-columns';
import type { EnrichedOrganization, OrganizationsRouteSearchParams } from '~/modules/organization/types';

const LIMIT = appConfig.requestLimits.organizations;

function rowKeyGetter(row: EnrichedOrganization) {
  return row.id;
}

function OrganizationsTable() {
  const { t } = useTranslation();
  const changeRole = useChangeEntityRoleMutation();

  const { search, setSearch } = useSearchParams<OrganizationsRouteSearchParams>({
    from: '/_app/system/organizations',
  });

  const { q, sort, order } = search;
  const limit = LIMIT;

  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = organizationsListQueryOptions({ ...search, limit, include: 'counts' });

  const { rows, isLoading, isFetching, error, hasNextPage, fetchMore } = useInfiniteRows(queryOptions);
  const { selected, selectedRowIds, onSelectedRowsChange, clearSelection } = useRowSelection(rows);

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

  return (
    <>
      <OrganizationsTableBar
        queryKey={queryOptions.queryKey}
        selected={selected}
        columns={columns}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        setColumns={setColumns}
        clearSelection={clearSelection}
      />
      <DataTable<EnrichedOrganization>
        {...{
          rows,
          rowHeight: 52,
          onRowsChange,
          rowKeyGetter,
          columns,
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
              icon={BirdIcon}
              title="c:no_resource_yet"
              titleProps={{ resource: t('c:organization_other').toLowerCase() }}
            />
          ),
        }}
      />
    </>
  );
}

export { OrganizationsTable };
