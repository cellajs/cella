import { useEffect, useMemo, useRef } from 'react';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import { FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import SelectRole from '~/modules/common/form-fields/select-role';
import { useState } from 'react';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '~/hooks/use-debounce';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { Bird } from 'lucide-react';
import { DataTable } from '../common/data-table';
import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import type { SortColumn } from 'react-data-grid';

interface Props {
  query?: string;
  setQuery: (value?: string) => void;
  role: 'primary' | 'secondary' | undefined;
  isFiltered?: boolean;
  setRole: React.Dispatch<React.SetStateAction<LabelsParam['role']>>;
  onResetFilters: () => void;
  sort: LabelsParam['sort'];
  order: LabelsParam['order'];
}

const selectLabelOptions = [
  { key: 'all', value: 'all' },
  { key: 'primary', value: 'Primary' },
  { key: 'secondary', value: 'Secondary' },
];

const Toolbar = ({ role, query, setQuery, setRole, isFiltered, onResetFilters }: Props) => {
  const containerRef = useRef(null);

  const onRoleChange = (role?: string) => {
    setRole(role === 'all' ? undefined : (role as LabelsParam['role']));
  };

  return (
    <>
      <div className={'flex items-center justify-center'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarContent>
            <TableSearch value={query} setQuery={setQuery} />
            <SelectRole roles={selectLabelOptions} value={role === undefined ? 'all' : role} onChange={onRoleChange} className="h-10 sm:min-w-32" />
          </FilterBarContent>
        </TableFilterBar>
      </div>
      <div ref={containerRef} />
    </>
  );
};

const useColumns = () => {
  const { t } = useTranslation();

  const mobileColumns: ColumnOrColumnGroup<Labels>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: 'name',
      visible: true,
      sortable: true,
      renderHeaderCell: HeaderCell,
    },
    {
      key: 'count',
      sortable: true,
      visible: true,
      renderHeaderCell: HeaderCell,
      name: 'count',
      renderCell: ({ row }) => t(row.count.toString()),
    },
    {
      key: 'status',
      sortable: true,
      visible: true,
      renderHeaderCell: HeaderCell,
      name: 'status',
      renderCell: ({ row }) => t(row.status.toString()),
    },
  ];

  return useState<ColumnOrColumnGroup<Labels>[]>(mobileColumns);
};

interface LabelsParam {
  role?: 'secondary' | 'primary' | undefined;
  query?: string | undefined;
  sort?: 'name' | 'count' | undefined;
  order?: 'desc' | 'asc' | undefined;
}

interface Labels {
  id: string;
  name: string;
  count: number;
  status: number;
  role: 'secondary' | 'primary';
}

export const labelsQueryOptions = (idOrSlug: string, { query, sort: initialSort, order: initialOrder, role }: LabelsParam) => {
  const sort = initialSort || 'name';
  const order = initialOrder || 'asc';

  return infiniteQueryOptions({
    queryKey: ['labels', idOrSlug, query, sort, order, role],
    initialPageParam: 0,
    queryFn: async () => {
      const fetchedData = [] as Labels[];
      // set labels fetch
      //   await getOrganizationMembers(
      //     idOrSlug,
      //     {
      //       query,
      //       sort,
      //       order,
      //       role,
      //     },
      //     signal,
      //   );

      return fetchedData;
    },
    getNextPageParam: (allPages) => allPages.length,
    refetchOnWindowFocus: false,
  });
};

const LabelsTable = () => {
  const [columns] = useColumns();
  //   const search = useSearch({
  //     from: OrganizationMembersRoute.id,
  //   }) as LabelsParam;

  const search = { sort: '', order: '', query: '', role: 'primary' as const };
  const [rows, setRows] = useState<Labels[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(
    search.sort && search.order
      ? [{ columnKey: search.sort, direction: search.order === 'asc' ? 'ASC' : 'DESC' }]
      : [{ columnKey: 'name', direction: 'ASC' }],
  );
  const [query, setQuery] = useState<LabelsParam['query']>(search.query);
  const [role, setRole] = useState<LabelsParam['role']>(search.role);

  const debounceQuery = useDebounce(query, 300);
  // Save filters in search params
  const filters = useMemo(
    () => ({
      query,
      sort: sortColumns[0]?.columnKey,
      order: sortColumns[0]?.direction.toLowerCase(),
      role,
    }),
    [query, role, sortColumns],
  );

  useSaveInSearchParams(filters, {
    sort: 'name',
    order: 'asc',
  });

  const queryResult = useInfiniteQuery(
    labelsQueryOptions('id1', {
      query: debounceQuery,
      sort: sortColumns[0]?.columnKey as LabelsParam['sort'],
      order: sortColumns[0]?.direction.toLowerCase() as LabelsParam['order'],
      role,
    }),
  );

  const onRowsChange = (records: Labels[]) => {
    // for (const index of indexes) {
    //   const label = records[index];

    // }

    setRows(records);
  };

  const isFiltered = role !== undefined || !!query;

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
    setRole(undefined);
  };

  useEffect(() => {
    const data = queryResult.data?.pages?.flatMap((page) => page);

    if (data) {
      setSelectedRows(new Set<string>([...selectedRows].filter((id) => data.some((row) => row.id === id))));
      setRows(data);
    }
  }, [queryResult.data]);

  return (
    <div className="space-y-4">
      <Toolbar
        role={role}
        query={query}
        setQuery={setQuery}
        setRole={setRole}
        isFiltered={true}
        onResetFilters={onResetFilters}
        sort={sortColumns[0]?.columnKey as LabelsParam['sort']}
        order={sortColumns[0]?.direction.toLowerCase() as LabelsParam['order']}
      />
      <DataTable<Labels>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount: 100,
          rowHeight: 42,
          rowKeyGetter: (row) => row.id,
          enableVirtualization: false,
          //   error: queryResult.error,
          //   isLoading: queryResult.isLoading,
          //   isFetching: queryResult.isFetching,
          //   fetchMore: queryResult.fetchNextPage,
          overflowNoRows: true,
          limit: 22,
          isFiltered,
          selectedRows,
          onRowsChange,
          onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: (
            <>
              <Bird strokeWidth={1} className="w-20 h-20" />
              <div className="mt-6 text-sm font-light">No labels</div>
            </>
          ),
        }}
      />
    </div>
  );
};

export default LabelsTable;
