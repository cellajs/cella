import { Bird } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import type { Label } from '~/modules/common/electric/electrify';
import { useColumns } from './columns';
import { Toolbar } from './toolbar';

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
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:labels'.toLowerCase()) })} />,
        }}
      />
    </div>
  );
};

export default LabelsTable;
