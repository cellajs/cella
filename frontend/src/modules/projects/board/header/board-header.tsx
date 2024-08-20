import { PanelTopClose, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import { sheet } from '~/modules/common/sheeter/state';
import StickyBox from '~/modules/common/sticky-box';
import BoardSearch from '~/modules/projects/board/header/board-search';
import DisplayOptions from '~/modules/projects/board/header/display-options';
import { Button } from '~/modules/ui/button';
import { WorkspaceSettings } from '~/modules/workspaces/workspace-settings';
import { useNavigationStore } from '~/store/navigation';
import { useWorkspaceStore } from '~/store/workspace';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { TooltipButton } from '~/modules/common/tooltip-button';
import AddProjects from '~/modules/projects/add-project';
import LabelsTable from '~/modules/tasks/labels-table';
import WorkspaceActions from './board-header-actions';
import TaskSelectedTableButtons from './selected-buttons';

const BoardHeader = () => {
  const { t } = useTranslation();

  const { setFocusView } = useNavigationStore();
  const { workspace, selectedTasks, searchQuery, showPageHeader, togglePageHeader, labels } = useWorkspaceStore();

  const openSettingsSheet = () => {
    sheet.create(<WorkspaceSettings sheet workspace={workspace} />, {
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:workspace_settings'),
      text: t('common:workspace_settings.text'),
      id: 'edit-workspace',
    });
  };

  const openLabelsSheet = () => {
    sheet.create(<LabelsTable labels={labels} />, {
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:manage_labels'),
      // text: '',
      id: 'workspace-settings',
    });
  };

  const handleAddProjects = () => {
    dialog(<AddProjects dialog workspace={workspace} />, {
      //callback={(project) => callback([project], 'create')} dialog
      className: 'md:max-w-4xl',
      id: 'add-projects',
      title: t('common:add_projects'),
    });
  };

  const handleTogglePageHeader = () => {
    setFocusView(false);
    togglePageHeader();
  };

  return (
    <StickyBox className="flex items-center max-sm:justify-between gap-2 z-[60] bg-background p-2 -m-2 md:p-3 md:-m-3">
      {!selectedTasks.length && (
        <div className="flex gap-2">
          <TooltipButton toolTipContent={t('common:page_view')}>
            <Button variant="outline" className="h-10 w-10 min-w-10" size="auto" onClick={handleTogglePageHeader}>
              {showPageHeader ? (
                <PanelTopClose size={16} />
              ) : (
                <AvatarWrap className="cursor-pointer" type="workspace" id={workspace.id} name={workspace.name} url={workspace.thumbnailUrl} />
              )}
            </Button>
          </TooltipButton>
          {!searchQuery.length && (
            <TooltipButton className="max-md:hidden" toolTipContent={t('common:add_project')}>
              <Button variant="plain" onClick={handleAddProjects}>
                <Plus size={16} />
                <span className="max-lg:hidden ml-1">{t('common:add')}</span>
              </Button>
            </TooltipButton>
          )}
        </div>
      )}
      {!!selectedTasks.length && <TaskSelectedTableButtons />}
      <BoardSearch />
      <WorkspaceActions createNewProject={handleAddProjects} openSettingsSheet={openSettingsSheet} openLabelsSheet={openLabelsSheet} />
      <DisplayOptions className="max-sm:hidden" />
      <FocusView iconOnly />
    </StickyBox>
  );
};

export default BoardHeader;
