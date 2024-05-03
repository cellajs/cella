import { Settings, Plus, Tag, Trash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import WorkspaceView from '~/modules/projects/view-options';
import DisplayOptions from '~/modules/projects/display-options';
import BoardSearch from '~/modules/projects/board-search';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import { sheet } from '~/modules/common/sheeter/state';
import { Button } from '~/modules/ui/button';
import { WorkspaceSettings } from '~/modules/workspaces/workspace-settings';
import AddProjects from './add-projects';
import { AvatarWrap } from '../common/avatar-wrap';
import LabelsTable from './labels-table';
import { WorkspaceContext } from '../workspaces';
import { useContext, useState } from 'react';
import { ProjectsContext } from '.';
import { Badge } from '../ui/badge';
import { useElectric } from '../common/root/electric';
import { PageHeader } from '../common/page-header';
import WorkspaceJoinLeaveButton from '../workspaces/join-leave-button';

function BoardHeader() {
  const { t } = useTranslation();
  const { labels, workspace } = useContext(WorkspaceContext);
  const { selectedTasks, setSelectedTasks } = useContext(ProjectsContext);
  const [showPageCover, setShowPageCover] = useState(false);

  const handleShowPageCoverToggle = () => {
    setShowPageCover(!showPageCover);
  };
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const { db } = useElectric()!;

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

  return (
    <>
      {showPageCover && (
        <PageHeader
          type="WORKSPACE"
          id={workspace.id}
          title={workspace.name}
          thumbnailUrl={workspace.thumbnailUrl}
          bannerUrl={workspace.bannerUrl}
          panel={
            <div className="flex items-center p-2">
              <WorkspaceJoinLeaveButton workspace={workspace} />
            </div>
          }
        />
      )}

      <div className={'flex items-center w-full max-sm:justify-between gap-2 p-2'}>
        <AvatarWrap
          onClick={handleShowPageCoverToggle}
          className="my-2 ml-2 mr-0 cursor-pointer"
          type="WORKSPACE"
          id={workspace.id}
          name={workspace.name}
          url={workspace.thumbnailUrl}
        />
        {selectedTasks.length > 0 ? (
          <Button variant="destructive" className="relative" onClick={onRemove}>
            <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedTasks.length}</Badge>
            <Trash size={16} />
            <span className="ml-1 max-xs:hidden">{t('common:remove')}</span>
          </Button>
        ) : (
          <>
            <Button variant="plain" onClick={handleAddProjects}>
              <Plus size={16} />
              <span className="max-sm:hidden ml-1">{t('common:add')}</span>
            </Button>

            <Button variant="outline" onClick={openSettingsSheet}>
              <Settings size={16} />
              <span className="ml-1 max-lg:hidden">{t('common:settings')}</span>
            </Button>

            <Button variant="outline" onClick={openLabelsSheet}>
              <Tag size={16} />
              <span className="ml-1 max-lg:hidden">{t('common:labels')}</span>
            </Button>
          </>
        )}
        <BoardSearch />
        <WorkspaceView className="max-sm:hidden" />
        <DisplayOptions className="max-sm:hidden" />
        <FocusView iconOnly />
      </div>
    </>
  );
}

export default BoardHeader;
