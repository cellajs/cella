import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bird } from 'lucide-react';
import type { SortColumn } from 'react-data-grid';
import { useColumns } from './columns';
import type { Label } from '~/modules/common/root/electric';
import { Toolbar } from './toolbar';
import { DataTable } from '~/modules/common/data-table';

export interface LabelsParam {
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
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);

  const [query, setQuery] = useState<LabelsParam['query']>('');

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
    setSelectedLabels([]);
  };

  const handleSelectedRowsChange = (selectedRows: Set<string>) => {
    setSelectedLabels(Array.from(selectedRows));
  };

  const filteredLabels = useMemo(() => {
    if (!query) return labels;
    return labels.filter((label) => label.name.toLowerCase().includes(query.toLowerCase()));
  }, [query, labels]);

  useEffect(() => {
    const rows = filteredLabels.map((label) => label);
    if (rows) setRows(rows);
  }, [filteredLabels]);
  return (
    <div className="space-y-4">
      <Toolbar
        searchQuery={query || ''}
        setSearchQuery={setQuery}
        selectedLabels={selectedLabels}
        setSelectedLabels={setSelectedLabels}
        //change filtering
        isFiltered={false}
        onResetFilters={onResetFilters}
        sort={sortColumns[0]?.columnKey as LabelsParam['sort']}
        order={sortColumns[0]?.direction.toLowerCase() as LabelsParam['order']}
      />
      <DataTable<Label>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount: 20,
          rowHeight: 42,
          rowKeyGetter: (row) => row.id,
          enableVirtualization: false,
          overflowNoRows: true,
          limit: 22,
          isFiltered,
          selectedRows: new Set<string>(selectedLabels),
          onRowsChange,
          onSelectedRowsChange: handleSelectedRowsChange,
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
