import { Plus, Trash, XSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { useElectric } from '~/modules/common/electric/electrify';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import type { LabelsParam } from '.';

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

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const Electric = useElectric()!;

  const removeLabel = () => {
    if (!Electric) return toast.error(t('common:no_local_db'))

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
              <Button variant="destructive" className="relative" onClick={removeLabel}>
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
