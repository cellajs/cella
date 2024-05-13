import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import type { LabelsParam } from '.';
import { useTranslation } from 'react-i18next';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { Plus, Trash, XSquare } from 'lucide-react';
import { Badge } from '~/modules/ui/badge';

interface Props {
  searchQuery: string;
  setSearchQuery: (value?: string) => void;
  selectedLabels: string[];
  setSelectedLabels: React.Dispatch<React.SetStateAction<string[]>>;
  isFiltered?: boolean;
  onResetFilters: () => void;
  sort: LabelsParam['sort'];
  order: LabelsParam['order'];
}

export const Toolbar = ({ searchQuery, setSearchQuery, selectedLabels, setSelectedLabels, isFiltered, onResetFilters }: Props) => {
  const { t } = useTranslation();

  return (
    <div className={'flex  w-full max-sm:justify-between gap-2'}>
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        {!selectedLabels.length && !searchQuery.length && (
          <FilterBarActions>
            <TooltipButton toolTipContent={t('common:add_label')}>
              <Button
                variant="plain"
                onClick={() => {
                  console.log('add new label');
                }}
              >
                <Plus size={16} />
                <span className="max-sm:hidden ml-1">{t('common:add')}</span>
              </Button>
            </TooltipButton>
          </FilterBarActions>
        )}
        {!!selectedLabels.length && (
          <div className="inline-flex align-center items-center gap-2">
            <TooltipButton toolTipContent={t('common:remove_task')}>
              <Button
                variant="destructive"
                className="relative"
                onClick={() => {
                  console.log('labels removed');
                }}
              >
                <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedLabels.length}</Badge>
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
        <FilterBarContent className="max-sm:ml-1 w-full">
          <TableSearch value={searchQuery} setQuery={setSearchQuery} />
        </FilterBarContent>
      </TableFilterBar>
    </div>
  );
};
