import { GripVertical, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { BackgroundPicker } from '~/modules/common/background-picker';
import { Button } from '~/modules/ui/button';
import { CardHeader } from '~/modules/ui/card';
import ToolTipButtons from './tooltip-buttons';
import CreateTaskForm from './task-form';
import { sheet } from '../common/sheeter/state';
import { ProjectSettings } from './project-settings';
import { useTranslation } from 'react-i18next';
import type { Column } from './board-column';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';

export interface ColumnDragData {
  type: 'Column';
  column: Column;
}

interface BoardColumnHeaderProps {
  column: Column;
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
}

export function BoardColumnHeader({ column, attributes, listeners }: BoardColumnHeaderProps) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const [createForm, setCreateForm] = useState(false);

  const openSettingsSheet = () => {
    sheet(<ProjectSettings />, {
      className: 'sm:max-w-[64rem]',
      title: t('common:project_settings'),
      text: t('common:project_settings.text'),
      id: 'project_settings',
    });
  };

  const handleTaskFormClick = () => {
    if (!createForm) {
      const container = document.getElementById(`${column.id}-viewport`);
      container?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setCreateForm(!createForm);
  };

  // TODO
  const [background, setBackground] = useState('#ff75c3');

  return (
    <>
      <CardHeader className="p-3 text-normal leading-4 font-semibold border-b flex flex-row gap-2 space-between items-center">
        <Button variant={'ghost'} {...attributes} {...listeners} size="xs" className="max-xs:hidden px-0 text-primary/50 -ml-1 cursor-grab relative">
          <span className="sr-only">{`Move column: ${column.name}`}</span>
          <GripVertical size={16} />
        </Button>

        <BackgroundPicker background={background} setBackground={setBackground} options={['solid']} />

        <div>{column.name}</div>

        <div className="grow" />

        <ToolTipButtons key={column.id} rolledUp={false} onSettingsClick={openSettingsSheet} />

        <Button variant="plain" size="xs" className="rounded" onClick={handleTaskFormClick}>
          <Plus size={16} className={`transition-transform ${createForm ? 'rotate-45 scale-125' : 'rotate-0'}`} />
          <span className="ml-1">Task</span>
        </Button>
      </CardHeader>
      <div ref={containerRef} />
      {createForm && <CreateTaskForm onCloseForm={() => setCreateForm(false)} />}
    </>
  );
}
