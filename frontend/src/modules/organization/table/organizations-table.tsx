import { BirdIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import type { RowsChangeData } from '~/modules/common/data-grid';
import { DataTable, rowKeyById } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { useInfiniteRows } from '~/modules/common/data-table/use-infinite-rows';
import { useRowSelection } from '~/modules/common/data-table/use-row-selection';
import { useChangeEntityRoleMutation } from '~/modules/memberships/query-mutations';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { OrganizationsTableBar } from '~/modules/organization/table/organizations-bar';
import { useColumns } from '~/modules/organization/table/organizations-columns';
import type { EnrichedOrganization, OrganizationsRouteSearchParams } from '~/modules/organization/types';

export function OrganizationsTable() {
  const { t } = useTranslation();
  const changeRole = useChangeEntityRoleMutation();

  const { search, setSearch } = useSearchParams<OrganizationsRouteSearchParams>({ from: '/_app/system/organizations' });

  const { q, sort, order } = search;

  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = organizationsListQueryOptions({ ...search, include: 'counts' });

  const list = useInfiniteRows(queryOptions);
  const { selected, selectedRowIds, onSelectedRowsChange, clearSelection } = useRowSelection(list.rows);

  const onRowsChange = (changedRows: EnrichedOrganization[], { column, indexes }: RowsChangeData<EnrichedOrganization>) => {
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
        searchVars={search}
        setSearch={setSearch}
        setColumns={setColumns}
        clearSelection={clearSelection}
      />
      <DataTable<EnrichedOrganization>
        {...{
          ...list,
          onRowsChange,
          rowKeyGetter: rowKeyById,
          columns,
          enableVirtualization: true,
          isFiltered: !!q,
          selectedRows: selectedRowIds,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder icon={BirdIcon} title="c:no_resource_yet" titleOptions={{ resource: t('c:organization_other').toLowerCase() }} />
          ),
        }}
      />
    </>
  );
}
