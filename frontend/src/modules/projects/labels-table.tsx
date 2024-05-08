import { useRef } from 'react';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import { FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { useState } from 'react';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import HeaderCell from '~/modules/common/data-table/header-cell';
import { useTranslation } from 'react-i18next';
import { Bird } from 'lucide-react';
import { DataTable } from '../common/data-table';
import type { SortColumn } from 'react-data-grid';
import type { Label } from '../common/root/electric';

interface Props {
  query?: string;
  setQuery: (value?: string) => void;
  isFiltered?: boolean;
  onResetFilters: () => void;
  sort: LabelsParam['sort'];
  order: LabelsParam['order'];
}

const Toolbar = ({ query, setQuery, isFiltered, onResetFilters }: Props) => {
  const containerRef = useRef(null);

  return (
    <>
      <div className={'flex items-center justify-center'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarContent>
            <TableSearch value={query} setQuery={setQuery} />
          </FilterBarContent>
        </TableFilterBar>
      </div>
      <div ref={containerRef} />
    </>
  );
};

const useColumns = () => {
  const { t } = useTranslation();

  const mobileColumns: ColumnOrColumnGroup<Label>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: 'Name',
      visible: true,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => t(row.name),
    },
    // {
    //   key: 'count',
    //   sortable: true,
    //   visible: true,
    //   renderHeaderCell: HeaderCell,
    //   name: 'Count',
    //   renderCell: ({ row }) => t(row.count.toString()),
    // },
    // {
    //   key: 'lastAdd',
    //   sortable: true,
    //   visible: true,
    //   renderHeaderCell: HeaderCell,
    //   name: 'Last active',
    //   renderCell: ({ row }) => dateShort(row.lastActive.toString()),
    // },
  ];

  return useState<ColumnOrColumnGroup<Label>[]>(mobileColumns);
};

interface LabelsParam {
  role?: 'secondary' | 'primary' | undefined;
  query?: string | undefined;
  sort?: 'name' | 'count' | undefined;
  order?: 'desc' | 'asc' | undefined;
}

const LabelsTable = ({ labels }: { labels: Label[] }) => {
  const { t } = useTranslation();

  const [columns] = useColumns();
  const defaultSearch: LabelsParam = { sort: 'name', order: 'asc' };
  const [search] = useState(defaultSearch);
  const [rows, setRows] = useState<Label[]>(labels || []);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [query, setQuery] = useState<LabelsParam['query']>();
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(
    search.sort && search.order
      ? [{ columnKey: search.sort, direction: search.order === 'asc' ? 'ASC' : 'DESC' }]
      : [{ columnKey: 'name', direction: 'ASC' }],
  );

  const onRowsChange = (records: Label[]) => {
    setRows(records);
  };

  const isFiltered = !!query;

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
  };

  return (
    <div className="space-y-4">
      <Toolbar
        query={query}
        setQuery={setQuery}
        isFiltered={true}
        onResetFilters={onResetFilters}
        sort={sortColumns[0]?.columnKey as LabelsParam['sort']}
        order={sortColumns[0]?.direction.toLowerCase() as LabelsParam['order']}
      />
      <DataTable<Label>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount: 100,
          rowHeight: 42,
          rowKeyGetter: (row) => row.id,
          enableVirtualization: false,
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
              <Bird strokeWidth={0.7} size={80} className="opacity-50" />
              <div className="mt-6 text-sm">{t('common:no_labels')}</div>
            </>
          ),
        }}
      />
    </div>
  );
};

export default LabelsTable;
