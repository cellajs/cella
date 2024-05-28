import { FilterX, PanelTopClose, Plus, Settings, Tag, Trash, XSquare } from 'lucide-react';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import { sheet } from '~/modules/common/sheeter/state';
import BoardSearch from '~/modules/projects/board-search';
import DisplayOptions from '~/modules/projects/display-options';
import WorkspaceView from '~/modules/projects/view-options';
import { Button } from '~/modules/ui/button';
import { WorkspaceSettings } from '~/modules/workspaces/workspace-settings';
import { AvatarWrap } from '../common/avatar-wrap';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '../common/data-table/table-filter-bar';
import { useElectric } from '../common/electric/electrify';
import { TooltipButton } from '../common/tooltip-button';
import { Badge } from '../ui/badge';
import { WorkspaceContext } from '../workspaces';
import AddProjects from './add-projects';
import LabelsTable from './labels-table';

interface BoardHeaderProps {
  showPageHeader: boolean;
  handleShowPageHeader?: () => void;
}

const BoardHeader = ({ showPageHeader, handleShowPageHeader }: BoardHeaderProps) => {
  const { t } = useTranslation();

  const { tasksCount, workspace, selectedTasks, setSelectedTasks, searchQuery, setSearchQuery, labels } = useContext(WorkspaceContext);

  const Electric = useElectric();

  const openSettingsSheet = () => {
    sheet(<WorkspaceSettings sheet />, {
      className: 'sm:max-w-[52rem]',
      title: t('common:workspace_settings'),
      text: t('common:workspace_settings.text'),
      id: 'edit-workspace',
    });
  };

  const openLabelsSheet = () => {
    sheet(<LabelsTable labels={labels} />, {
      className: 'sm:max-w-[48rem]',
      title: t('common:manage_labels'),
      // text: '',
      id: 'workspace_settings',
    });
  };

  const onRemove = () => {
    if (!Electric) return toast.error(t('common:local_db_inoperable'));

    Electric.db.tasks
      .deleteMany({
        where: {
          id: {
            in: selectedTasks,
          },
        },
      })
      .then(() => {
        toast.success(t(`common:success.delete_${selectedTasks.length > 1 ? 'tasks' : 'task'}`));
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

  return (
    <div className={'flex items-center w-full max-sm:justify-between sm:gap-2'}>
      <TableFilterBar
        onResetFilters={() => {
          setSearchQuery('');
          setSelectedTasks([]);
        }}
        isFiltered={!!selectedTasks.length || !!searchQuery.length}
      >
        <FilterBarActions>
          <TooltipButton toolTipContent={t('common:page_view')}>
            <Button variant="outline" className="h-10 w-10 min-w-10" size="auto" onClick={handleShowPageHeader}>
              {showPageHeader ? (
                <PanelTopClose size={16} />
              ) : (
                <AvatarWrap className="cursor-pointer" type="WORKSPACE" id={workspace.id} name={workspace.name} url={workspace.thumbnailUrl} />
              )}
            </Button>
          </TooltipButton>

          {!selectedTasks.length && !searchQuery.length && (
            <div className="flex gap-2">
              <TooltipButton toolTipContent={t('common:add_project')}>
                <Button variant="plain" onClick={handleAddProjects}>
                  <Plus size={16} />
                  <span className="max-sm:hidden ml-1">{t('common:add')}</span>
                </Button>
              </TooltipButton>
              <TooltipButton toolTipContent={t('common:manage_labels')}>
                <Button variant="outline" onClick={openLabelsSheet}>
                  <Tag size={16} />
                  <span className="ml-1 max-lg:hidden">{t('common:labels')}</span>
                </Button>
              </TooltipButton>
              <TooltipButton toolTipContent={t('common:workspace_settings')}>
                <Button variant="outline" onClick={openSettingsSheet}>
                  <Settings size={16} />
                </Button>
              </TooltipButton>
            </div>
          )}
        </FilterBarActions>
        {!!searchQuery.length && (
          <div className="inline-flex align-center text-muted-foreground text-sm  items-center gap-2 max-sm:hidden">
            <TooltipButton toolTipContent={t('common:clear_filter')}>
              <Button variant="ghost" onClick={() => setSearchQuery('')}>
                <FilterX size={16} />
                <span className="ml-1">{t('common:clear')}</span>
              </Button>
            </TooltipButton>
            <div className="w-max mx-2">{`${tasksCount} ${tasksCount > 0 && searchQuery ? `task ${t('common:found')}` : 'tasks'}`}</div>
          </div>
        )}
        {!!selectedTasks.length && (
          <div className="inline-flex align-center items-center gap-2">
            <TooltipButton toolTipContent={t('common:remove_task')}>
              <Button variant="destructive" className="relative" onClick={onRemove}>
                <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedTasks.length}</Badge>
                <Trash size={16} />
                <span className="ml-1 max-xs:hidden">{t('common:remove')}</span>
              </Button>
            </TooltipButton>
            <TooltipButton toolTipContent={t('common:clear_selected_task')}>
              <Button variant="ghost" className="relative" onClick={() => setSelectedTasks([])}>
                <XSquare size={16} />
                <span className="ml-1 max-xs:hidden">{t('common:clear')}</span>
              </Button>
            </TooltipButton>
          </div>
        )}

        <div className="grow sm:hidden" />

        <FilterBarContent className="w-full">
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
