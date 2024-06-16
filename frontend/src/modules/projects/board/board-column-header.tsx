import { GripVertical, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { useWorkspaceContext } from '~/modules/workspaces/workspace-context';
import { useWorkspaceStore } from '~/store/workspace';
import { useProjectContext } from './project-context';
import ToolTipButtons from './tooltip-buttons';

interface BoardColumnHeaderProps {
  createFormOpen: boolean;
  dragRef: React.RefObject<HTMLButtonElement>;
  openSettings: () => void;
  createFormClick: () => void;
}

export function BoardColumnHeader({ createFormOpen, openSettings, createFormClick, dragRef }: BoardColumnHeaderProps) {
  const { project } = useProjectContext(({ project }) => ({ project }));
  const { workspace } = useWorkspaceContext(({ workspace }) => ({ workspace }));
  const { changeColumn } = useWorkspaceStore();
  const { t } = useTranslation();
  const [minimize, setMinimize] = useState(false);

  const MinimizeClick = () => {
    setMinimize(!minimize);
    changeColumn(workspace.id, project.id, {
      minimized: !minimize,
    });
  };

  // 72px is 64px for the header and 8px for the gap between the header and content
  const stickyStyles = 'sticky sm:relative top-2sendVerificationEmailRouteConfig sm:top-0 bg-background z-50';

  return (
    <div className={`border p-3 rounded-lg rounded-b-none text-normal leading-4 flex flex-row gap-2 space-between items-center ${stickyStyles}`}>
      <Button ref={dragRef} variant={'ghost'} size="xs" className="max-sm:hidden px-0 text-primary/50 cursor-grab relative">
        <GripVertical size={16} />
      </Button>
      {/* Omit style background if projects will be without a color preference. */}
      <AvatarWrap className="h-8 w-8 text-xs" name={project.name} style={{ background: `#${project.color}` }} />
      <div className="truncate">{project.name}</div>
      <div className="grow" />
      <ToolTipButtons rolledUp={false} onSettingsClick={openSettings} onMinimizeClick={MinimizeClick} />
      <Button variant="plain" size="xs" className="rounded" onClick={createFormClick}>
        <Plus size={16} className={`transition-transform ${createFormOpen ? 'rotate-45 scale-125' : 'rotate-0'}`} />
        <span className="ml-1">{t('common:task')}</span>
      </Button>
    </div>
  );
}
