import { PanelTopClose, Plus, Settings, Tag, Trash } from 'lucide-react';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import { sheet } from '~/modules/common/sheeter/state';
import BoardSearch from '~/modules/projects/board-search';
import DisplayOptions from '~/modules/projects/display-options';
import WorkspaceView from '~/modules/projects/view-options';
import { Button } from '~/modules/ui/button';
import { WorkspaceSettings } from '~/modules/workspaces/workspace-settings';
import { useElectric } from '../common/app/electric';
import { AvatarWrap } from '../common/avatar-wrap';
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

  const { labels, workspace, selectedTasks, setSelectedTasks } = useContext(WorkspaceContext);

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
    <div className={'flex items-center w-full max-sm:justify-between gap-2'}>
      <Button variant="outline" className="h-10 w-10 min-w-10" size="auto" onClick={handleShowPageHeader}>
        {showPageHeader ? (
          <PanelTopClose size={16} />
        ) : (
          <AvatarWrap className="cursor-pointer" type="WORKSPACE" id={workspace.id} name={workspace.name} url={workspace.thumbnailUrl} />
        )}
      </Button>

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

          <Button variant="outlinePrimary" onClick={openLabelsSheet}>
            <Tag size={16} />
            <span className="ml-1 max-lg:hidden">{t('common:labels')}</span>
          </Button>

          <Button variant="outline" onClick={openSettingsSheet}>
            <Settings size={16} />
            <span className="ml-1 max-lg:hidden">{t('common:settings')}</span>
          </Button>
        </>
      )}
      <BoardSearch />
      <WorkspaceView className="max-sm:hidden" />
      <DisplayOptions className="max-sm:hidden" />
      <FocusView iconOnly />
    </div>
  );
};

export default BoardHeader;
