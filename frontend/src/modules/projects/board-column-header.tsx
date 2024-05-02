import { GripVertical, Plus } from 'lucide-react';
import { useState } from 'react';
import { BackgroundPicker } from '~/modules/common/background-picker';
import { Button } from '~/modules/ui/button';
import { CardHeader } from '~/modules/ui/card';
import ToolTipButtons from './tooltip-buttons';
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
  createFormOpen: boolean;
  openSettings: () => void;
  createFormClick: () => void;
  children?: React.ReactNode;
}

export function BoardColumnHeader({
  column,
  attributes,
  listeners,
  createFormOpen,
  openSettings,
  createFormClick,
  children,
}: BoardColumnHeaderProps) {
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

        <ToolTipButtons key={column.id} rolledUp={false} onSettingsClick={openSettings} />

        <Button variant="plain" size="xs" className="rounded" onClick={createFormClick}>
          <Plus size={16} className={`transition-transform ${createFormOpen ? 'rotate-45 scale-125' : 'rotate-0'}`} />
          <span className="ml-1">Task</span>
        </Button>
      </CardHeader>
      {children && children}
    </>
  );
}
