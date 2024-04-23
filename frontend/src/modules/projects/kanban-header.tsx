import { Settings, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import WorkspaceView from '~/modules/projects/workspace-view';
import BoardSearch from '~/modules/projects/board-search';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import { sheet } from '~/modules/common/sheeter/state';
import { Button } from '~/modules/ui/button';
import { WorkspaceSettings } from '~/modules/workspaces/workspace-settings';
import { CreateProjectForm } from './create-project-form';

function KanbanHeader() {
  const { t } = useTranslation();

  const openSettingsSheet = () => {
    sheet(<WorkspaceSettings />, {
      className: 'sm:max-w-[64rem]',
      title: t('app:workspace_settings'),
      text: t('app:workspace_settings.text'),
      id: 'newsletter-form',
    });
  };

  return (
    <>
      <div className="flex items-center max-sm:justify-between gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            dialog(<CreateProjectForm />, {
              //callback={(project) => callback([project], 'create')} dialog
              className: 'md:max-w-xl',
              title: t('app:create_project'),
            });
          }}
        >
          <Plus size={16} />
          <span className="ml-1">{t('common:create')}</span>
        </Button>

        <Button variant="outline" onClick={openSettingsSheet}>
          <Settings size={16} />
          <span className="ml-1 max-sm:hidden">{t('common:settings')}</span>
        </Button>

        <BoardSearch />
        <WorkspaceView className="max-sm:hidden" />
        <FocusView iconOnly />
      </div>
    </>
  );
}

export default KanbanHeader;
