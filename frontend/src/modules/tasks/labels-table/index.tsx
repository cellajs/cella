import { Bird } from 'lucide-react';
import { Trash, XSquare } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import type { Label } from '~/modules/common/electric/electrify';
import { useElectric } from '~/modules/common/electric/electrify';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { useColumns } from './columns';

interface LabelsParam {
  role?: 'secondary' | 'primary' | undefined;
  query?: string | undefined;
  sort?: 'name' | 'count' | undefined;
  order?: 'desc' | 'asc' | undefined;
}

const LabelsTable = ({ labels }: { labels: Label[] }) => {
  const { t } = useTranslation();
  const Electric = useElectric();

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

  const onRowsChange = (changedRows: Label[]) => {
    setRows(changedRows);
  };

  const isFiltered = !!query;

  const onSearch = (searchString: string) => {
    setSelectedLabels([]);
    setQuery(searchString);
  };

  const onResetFilters = () => {
    setQuery('');
    setSelectedLabels([]);
  };

  const handleSelectedRowsChange = (selectedRows: Set<string>) => {
    setSelectedLabels(Array.from(selectedRows));
  };

  const removeLabel = () => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));

    Electric.db.labels
      .deleteMany({
        where: {
          id: {
            in: selectedLabels,
          },
        },
      })
      .then(() => {
        toast.success(t(`common:success.delete_${selectedLabels.length > 1 ? 'labels' : 'label'}`));
        setSelectedLabels([]);
      });
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
    <div className="flex flex-col gap-4 h-full">
      <div className={'flex pt-2 w-full max-sm:justify-between gap-2'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={false}>
          {/* {!selectedLabels.length && !searchQuery.length && (
          <FilterBarActions />
        )} */}
          {!!selectedLabels.length && (
            <div className="inline-flex align-center items-center gap-2">
              <TooltipButton toolTipContent={t('common:remove_task')}>
                <Button variant="destructive" className="relative" onClick={removeLabel}>
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5">{selectedLabels.length}</Badge>
                  <Trash size={16} />
                  <span className="ml-1 max-xs:hidden">{t('common:remove')}</span>
                </Button>
              </TooltipButton>
              <TooltipButton toolTipContent={t('common:clear_selected_task')}>
                <Button variant="ghost" className="relative" onClick={() => setSelectedLabels([])}>
                  <XSquare size={16} />
                  <span className="ml-1 max-xs:hidden">{t('common:clear')}</span>
                </Button>
              </TooltipButton>
            </div>
          )}
          <FilterBarContent className="w-full">
            <TableSearch value={query || ''} setQuery={onSearch} />
          </FilterBarContent>
        </TableFilterBar>
      </div>
      <DataTable<Label>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
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
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:labels').toLowerCase() })} />,
        }}
      />
    </div>
  );
};

export default LabelsTable;
