import { BirdIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import type { RowsChangeData } from '~/modules/common/data-grid';
import { DataTable, rowKeyById } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { useInfiniteRows } from '~/modules/common/data-table/use-infinite-rows';
import { useRowSelection } from '~/modules/common/data-table/use-row-selection';
import { SearchScope } from '~/modules/common/match-highlight/match-scope';
import { useChangeEntityRoleMutation } from '~/modules/memberships/query-mutations';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { OrganizationsTableBar } from '~/modules/organization/table/organizations-bar';
import { useColumns } from '~/modules/organization/table/organizations-columns';
import type { OrganizationRow, OrganizationsRouteSearchParams } from '~/modules/organization/types';

export function OrganizationsTable() {
  const { t } = useTranslation();
  const changeRole = useChangeEntityRoleMutation();

  const { search, setSearch } = useSearchParams<OrganizationsRouteSearchParams>({ from: '/_app/system/organizations' });

  const { q, kind, sort, order } = search;

  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = organizationsListQueryOptions({ ...search, include: 'counts' });

  const list = useInfiniteRows(queryOptions);
  const { selected, selectedRowIds, onSelectedRowsChange, clearSelection } = useRowSelection(list.rows);

  const onRowsChange = (changedRows: OrganizationRow[], { column, indexes }: RowsChangeData<OrganizationRow>) => {
    if (column.key !== 'role') return;

    return Promise.all(
      indexes.map((index) => {
        const { role, ...entity } = changedRows[index];
        return role && changeRole.mutateAsync({ entity, role });
      }),
    );
  };

  return (
    <>
      <OrganizationsTableBar queryKey={queryOptions.queryKey} searchVars={search} {...{ selected, columns, setSearch, setColumns, clearSelection }} />
      <SearchScope q={q}>
        <DataTable<OrganizationRow>
          {...{
            ...list,
            onRowsChange,
            rowKeyGetter: rowKeyById,
            columns,
            enableVirtualization: true,
            isFiltered: !!q || kind.length > 0,
            onResetFilters: () => setSearch({ q: '', kind: [] }),
            selectedRows: selectedRowIds,
            onSelectedRowsChange,
            sortColumns,
            onSortColumnsChange,
            NoRowsComponent: <ContentPlaceholder icon={BirdIcon} title="c:no_resource_yet" titleOptions={{ resource: t('c:organization_other') }} />,
          }}
        />
      </SearchScope>
    </>
  );
}
