import { PanelTopClose, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import { sheet } from '~/modules/common/sheeter/state';
import { TooltipButton } from '~/modules/common/tooltip-button';
import AddProjects from '~/modules/projects/add-project';
import WorkspaceActions from '~/modules/projects/board/header/board-header-actions';
import BoardSearch from '~/modules/projects/board/header/board-search';
import DisplayOptions from '~/modules/projects/board/header/display-options';
import TaskSelectedTableButtons from '~/modules/projects/board/header/selected-buttons';
import LabelsTable from '~/modules/tasks/labels-table';
import { Button } from '~/modules/ui/button';
import { WorkspaceSettings } from '~/modules/workspaces/workspace-settings';
import { useNavigationStore } from '~/store/navigation';
import { useWorkspaceStore } from '~/store/workspace';

const BoardHeader = () => {
  const { t } = useTranslation();
  const { setFocusView } = useNavigationStore();
  const { workspace, selectedTasks, showPageHeader, togglePageHeader } = useWorkspaceStore();

  const [searchFocused, setSearchFocused] = useState(false);

  const openSettingsSheet = () => {
    sheet.create(<WorkspaceSettings sheet />, {
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:resource_settings', { resource: t('app:workspace') }),
      text: t('common:resource_settings.text', { resource: t('app:workspace').toLowerCase() }),
      id: 'edit-workspace',
    });
  };

  const openLabelsSheet = () => {
    sheet.create(<LabelsTable />, {
      className: 'max-w-full lg:max-w-4xl',
      title: t('app:manage_labels'),
      // text: '',
      id: 'workspace-preview-labels',
    });
  };

  const handleAddProjects = () => {
    dialog(<AddProjects dialog workspace={workspace} />, {
      className: 'md:max-w-4xl',
      id: 'add-projects',
      title: t('common:add_resource', { resource: t('app:projects').toLowerCase() }),
    });
  };

  const handleTogglePageHeader = () => {
    setFocusView(false);
    togglePageHeader();
  };

  return (
    <div className="flex items-center max-sm:justify-between gap-2 z-[60] bg-background p-2 -m-2 md:p-3 md:-m-3">
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
        </div>
      )}
      {!!selectedTasks.length && <TaskSelectedTableButtons />}
      <BoardSearch toggleFocus={() => setSearchFocused(!searchFocused)} />
      {!searchFocused && (
        <TooltipButton className="max-md:hidden" toolTipContent={t('common:add_resource', { resource: t('app:project').toLowerCase() })}>
          <Button variant="plain" onClick={handleAddProjects}>
            <Plus size={16} />
            <span className="max-lg:hidden ml-1">{t('common:add')}</span>
          </Button>
        </TooltipButton>
      )}
      <WorkspaceActions createNewProject={handleAddProjects} openSettingsSheet={openSettingsSheet} openLabelsSheet={openLabelsSheet} />
      <DisplayOptions className="max-sm:hidden" />
      <FocusView iconOnly />
    </div>
  );
};

export default BoardHeader;
