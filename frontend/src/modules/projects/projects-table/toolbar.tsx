import { Trash, XSquare } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import ColumnsView, { type ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { dialog } from '~/modules/common/dialoger/state';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import type { ProjectRow } from '~/types';
import DeleteProjects from '../delete-project';

interface Props {
  total?: number;
  query?: string;
  selectedProjects: ProjectRow[];
  setQuery: (value?: string) => void;
  isFiltered?: boolean;
  onResetFilters: () => void;
  onResetSelectedRows?: () => void;
  callback: (projects: ProjectRow[], action: 'create' | 'update' | 'delete') => void;
  columns: ColumnOrColumnGroup<ProjectRow>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<ProjectRow>[]>>;
}

function Toolbar({ total, isFiltered, query, setQuery, onResetFilters, onResetSelectedRows, columns, setColumns, selectedProjects }: Props) {
  const { t } = useTranslation();

  const openDeleteDialog = () => {
    dialog(<DeleteProjects dialog projects={selectedProjects} />, {
      drawerOnMobile: false,
      className: 'max-w-xl',
      title: t('common:delete'),
      text: t('confirm.delete_resources', { resources: t('common:projects').toLowerCase() }),
    });
  };

  return (
    <>
      <div className={'flex items-center max-sm:justify-between md:gap-2 mt-4'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selectedProjects.length > 0 && (
              <>
                <Button variant="destructive" className="relative" onClick={openDeleteDialog}>
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedProjects.length}</Badge>
                  <Trash size={16} />
                  <span className="ml-1 max-lg:hidden">{t('common:remove')}</span>
                </Button>
                <Button variant="ghost" onClick={onResetSelectedRows}>
                  <XSquare size={16} />
                  <span className="ml-1">{t('common:clear')}</span>
                </Button>
              </>
            )}

            {selectedProjects.length === 0 && <TableCount count={total} type="project" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent>
            <TableSearch value={query} setQuery={setQuery} />
          </FilterBarContent>
        </TableFilterBar>
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
      </div>
    </>
  );
}

export default Toolbar;
