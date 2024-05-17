import { GripVertical, Plus } from 'lucide-react';
import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackgroundPicker } from '~/modules/common/background-picker';
import { Button } from '~/modules/ui/button';
import { CardHeader } from '~/modules/ui/card';
import { useWorkspaceStore } from '~/store/workspace';
import { ProjectContext } from './board';
import ToolTipButtons from './tooltip-buttons';

interface BoardColumnHeaderProps {
  createFormOpen: boolean;
  dragRef: React.RefObject<HTMLButtonElement>;
  openSettings: () => void;
  createFormClick: () => void;
}

export function BoardColumnHeader({ createFormOpen, openSettings, createFormClick, dragRef }: BoardColumnHeaderProps) {
  const { project } = useContext(ProjectContext);
  const { changeColumn } = useWorkspaceStore();
  const { t } = useTranslation();
  const [minimize, setMinimize] = useState(false);

  const MinimizeClick = () => {
    setMinimize(!minimize);
    changeColumn(project.workspaceId, project.id, {
      minimized: !minimize,
    });
  };

  // TODO
  const [background, setBackground] = useState('#ff75c3');

  return (
    <CardHeader className="p-3 border-b rounded-lg rounded-b-none text-normal leading-4 font-semibold flex flex-row gap-2 space-between items-center">
      <Button ref={dragRef} variant={'ghost'} size="xs" className="max-xs:hidden px-0 text-primary/50 -ml-1 cursor-grab relative">
        <GripVertical size={16} />
      </Button>
      <BackgroundPicker background={background} setBackground={setBackground} options={['solid']} />
      <div>{project.name}</div>
      <div className="grow" />
      <ToolTipButtons rolledUp={false} onSettingsClick={openSettings} onMinimizeClick={MinimizeClick} />
      <Button variant="plain" size="xs" className="rounded" onClick={createFormClick}>
        <Plus size={16} className={`transition-transform ${createFormOpen ? 'rotate-45 scale-125' : 'rotate-0'}`} />
        <span className="ml-1">{t('common:task')}</span>
      </Button>
    </CardHeader>
  );
}
