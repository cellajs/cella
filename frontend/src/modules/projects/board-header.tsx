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
import { useContext } from 'react';
import { ProjectsContext } from '.';
import { Badge } from '../ui/badge';
import { useElectric } from '../common/root/electric';

function BoardHeader() {
  const { t } = useTranslation();
  const { labels } = useContext(WorkspaceContext);
  const { selectedTasks, setSelectedTasks } = useContext(ProjectsContext);

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const { db } = useElectric()!;

  const openSettingsSheet = () => {
    sheet(<WorkspaceSettings />, {
      className: 'sm:max-w-[64rem]',
      title: t('common:workspace_settings'),
      text: t('common:workspace_settings.text'),
      id: 'workspace_settings',
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

  return (
    <>
      <div className="flex items-center max-sm:justify-between gap-2">
        <AvatarWrap type="WORKSPACE" id="sdfsdfsdf" name="dfsdfsdf" url={null} />

        {selectedTasks.length > 0 ? (
          <Button variant="destructive" className="relative" onClick={onRemove}>
            <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedTasks.length}</Badge>
            <Trash size={16} />
            <span className="ml-1 max-xs:hidden">{t('common:remove')}</span>
          </Button>
        ) : (
          <>
            <Button
              variant="plain"
              onClick={() => {
                dialog(<AddProjects dialog />, {
                  //callback={(project) => callback([project], 'create')} dialog
                  className: 'md:max-w-4xl',
                  id: 'add-projects',
                  title: t('common:add_projects'),
                });
              }}
            >
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
