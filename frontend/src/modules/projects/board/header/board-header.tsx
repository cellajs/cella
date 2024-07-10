import { useLiveQuery } from 'electric-sql/react';
import { FilterX, PanelTopClose, Plus, Trash, XSquare } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
import { AvatarWrap } from '../../../common/avatar-wrap';
import { type Label, useElectric } from '../../../common/electric/electrify';
import { TooltipButton } from '../../../common/tooltip-button';
import { Badge } from '../../../ui/badge';
import AddProjects from '../../add-project';
import LabelsTable from '../../labels-table';
import WorkspaceActions from './header-actions';

const BoardHeader = ({ mode, children }: { mode: 'table' | 'board'; children?: React.ReactNode }) => {
  const { t } = useTranslation();

  const { setFocusView } = useNavigationStore();
  const { workspace, selectedTasks, setSelectedTasks, searchQuery, setSearchQuery, showPageHeader, togglePageHeader } = useWorkspaceStore();

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const electric = useElectric()!;

  const { results: labels = [] } = useLiveQuery(
    electric.db.labels.liveMany({
      where: {
        organization_id: workspace.organizationId,
      },
    }),
  ) as {
    results: Label[];
  };

  const openSettingsSheet = () => {
    sheet(<WorkspaceSettings sheet workspace={workspace} />, {
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:workspace_settings'),
      text: t('common:workspace_settings.text'),
      id: 'edit-workspace',
    });
  };

  const openLabelsSheet = () => {
    sheet(<LabelsTable labels={labels} />, {
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:manage_labels'),
      // text: '',
      id: 'workspace_settings',
    });
  };

  const onRemove = () => {
    if (!electric) return toast.error(t('common:local_db_inoperable'));

    electric.db.tasks
      .deleteMany({
        where: {
          id: {
            in: selectedTasks,
          },
        },
      })
      .then(() => {
        toast.success(t('common:success.delete_resources', { resources: t('common:tasks') }));
        setSelectedTasks([]);
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
    <StickyBox enabled={mode === 'table'} className="flex items-center max-sm:justify-between gap-2 z-[60] bg-background p-2 -m-2 md:p-3 md:-m-3">
      {!selectedTasks.length && !searchQuery.length && (
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
          <TooltipButton className="max-md:hidden" toolTipContent={t('common:add_project')}>
            <Button variant="plain" onClick={handleAddProjects}>
              <Plus size={16} />
              <span className="max-lg:hidden ml-1">{t('common:add')}</span>
            </Button>
          </TooltipButton>
        </div>
      )}
      {!!searchQuery.length && (
        <div className="inline-flex align-center text-muted-foreground text-sm  items-center gap-2 max-sm:hidden">
          <TooltipButton toolTipContent={t('common:clear_filter')}>
            <Button variant="ghost" onClick={() => setSearchQuery('')}>
              <FilterX size={16} />
              <span className="ml-1">{t('common:clear')}</span>
            </Button>
          </TooltipButton>
          {/* TODO: Add this after creating new store */}
          {/* <div className="w-max mx-2">{`${tasksCount} ${tasksCount > 0 && searchQuery ? `task ${t('common:found')}` : 'tasks'}`}</div> */}
        </div>
      )}
      {!!selectedTasks.length && (
        <div className="inline-flex align-center items-center gap-2">
          <TooltipButton toolTipContent={t('common:remove_task')}>
            <Button variant="destructive" className="relative" onClick={onRemove}>
              <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5 shadow-sm">{selectedTasks.length}</Badge>
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

      <BoardSearch />
      {children}
      <WorkspaceActions createNewProject={handleAddProjects} openSettingsSheet={openSettingsSheet} openLabelsSheet={openLabelsSheet} />
      <DisplayOptions className="max-sm:hidden" />
      <FocusView iconOnly />
    </StickyBox>
  );
};

export default BoardHeader;
