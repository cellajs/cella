import { PanelTopClose, Plus, Settings, Tag, Trash, XSquare, SearchX } from 'lucide-react';
import { useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import { sheet } from '~/modules/common/sheeter/state';
import BoardSearch from '~/modules/projects/board-search';
import DisplayOptions from '~/modules/projects/display-options';
import WorkspaceView from '~/modules/projects/view-options';
import { Button } from '~/modules/ui/button';
import { WorkspaceSettings } from '~/modules/workspaces/workspace-settings';
import { Badge } from '../ui/badge';
import { WorkspaceContext } from '../workspaces';
import AddProjects from './add-projects';
import LabelsTable from './labels-table';
import { type Label, useElectric } from '../common/root/electric';
import { AvatarWrap } from '../common/avatar-wrap';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '../common/data-table/table-filter-bar';

interface BoardHeaderProps {
  showPageHeader: boolean;
  handleShowPageHeader?: () => void;
}

const BoardHeader = ({ showPageHeader, handleShowPageHeader }: BoardHeaderProps) => {
  const { t } = useTranslation();

  const { workspace, selectedTasks, setSelectedTasks, projects, searchQuery, tasks, setSearchQuery } = useContext(WorkspaceContext);

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const { db } = useElectric()!;

  const labels = projects.flatMap((project) => project.labels).filter(Boolean) as Label[];

  const openSettingsSheet = () => {
    sheet(<WorkspaceSettings sheet />, {
      className: 'sm:max-w-[64rem]',
      title: t('common:workspace_settings'),
      text: t('common:workspace_settings.text'),
      id: 'edit-workspace',
    });
  };

  const openLabelsSheet = () => {
    sheet(<LabelsTable labels={labels} />, {
      className: 'sm:max-w-[48rem]',
      title: 'Labels',
      // text: '',
      id: 'workspace_settings',
    });
  };

  const onRemove = () => {
    db.tasks
      .deleteMany({
        where: {
          id: {
            in: selectedTasks,
          },
        },
      })
      .then(() => {
        setSelectedTasks([]);
      });
  };

  const handleAddProjects = () => {
    dialog(<AddProjects dialog />, {
      //callback={(project) => callback([project], 'create')} dialog
      className: 'md:max-w-4xl',
      id: 'add-projects',
      title: t('common:add_projects'),
    });
  };

  const filteredTasks = useMemo(() => {
    if (!searchQuery) return tasks;
    return tasks.filter(
      (task) =>
        task.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.markdown?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.slug.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [searchQuery, tasks]);

  return (
    <div className={'flex items-center w-full max-sm:justify-between gap-2'}>
      <TableFilterBar
        onResetFilters={() => {
          setSearchQuery('');
          setSelectedTasks([]);
        }}
        isFiltered={!!selectedTasks.length || !!searchQuery.length}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-10 w-10 min-w-10" size="auto" onClick={handleShowPageHeader}>
            {showPageHeader ? (
              <PanelTopClose size={16} />
            ) : (
              <AvatarWrap className="cursor-pointer" type="WORKSPACE" id={workspace.id} name={workspace.name} url={workspace.thumbnailUrl} />
            )}
          </Button>
          <FilterBarActions>
            {!selectedTasks.length && !searchQuery.length && (
              <div className="flex gap-1">
                <Button variant="plain" onClick={handleAddProjects}>
                  <Plus size={16} />
                  <span className="max-sm:hidden ml-1">{t('common:add')}</span>
                </Button>

                <Button variant="outlinePrimary" onClick={openLabelsSheet}>
                  <Tag size={16} />
                  <span className="ml-1 max-lg:hidden">{t('common:labels')}</span>
                </Button>

                <Button variant="outline" onClick={openSettingsSheet}>
                  <Settings size={16} />
                  <span className="ml-1 max-lg:hidden">{t('common:settings')}</span>
                </Button>
              </div>
            )}
          </FilterBarActions>
        </div>
        {!!searchQuery.length && (
          <div className="inline-flex align-center text-muted-foreground text-sm  items-center gap-2 max-xs:hidden">
            <Button variant="ghost" onClick={() => setSearchQuery('')}>
              <SearchX size={16} />
              <span className="ml-1">{t('common:clear_search')}</span>
            </Button>
            <div className="w-max mx-2">
              {`${filteredTasks.length} ${filteredTasks.length > 0 && searchQuery ? `task ${t('common:found')}` : 'tasks'}`}
            </div>
          </div>
        )}
        {!!selectedTasks.length && (
          <div className="inline-flex align-center items-center gap-2">
            <Button variant="destructive" className="relative" onClick={onRemove}>
              <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedTasks.length}</Badge>
              <Trash size={16} />
              <span className="ml-1 max-xs:hidden">{t('common:remove')}</span>
            </Button>
            <Button variant="ghost" className="relative" onClick={() => setSelectedTasks([])}>
              <XSquare size={16} />
              <span className="ml-1 max-xs:hidden">{t('common:clear')}</span>
            </Button>
          </div>
        )}
        <FilterBarContent className="max-sm:ml-1 w-full">
          <BoardSearch />
        </FilterBarContent>
      </TableFilterBar>
      <WorkspaceView className="max-sm:hidden" />
      <DisplayOptions className="max-sm:hidden" />
      <FocusView iconOnly />
    </div>
  );
};

export default BoardHeader;
