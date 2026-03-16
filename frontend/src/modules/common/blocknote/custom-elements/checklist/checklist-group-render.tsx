import type { BlockNoteEditor } from '@blocknote/core';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface ChecklistGroupRenderProps {
  block: {
    props: {
      title: string;
      collapsed: boolean;
    };
    children: Array<{ type: string; props: Record<string, any> }>;
  };
  editor: BlockNoteEditor<any, any, any>;
}

export function ChecklistGroupRender({ block, editor }: ChecklistGroupRenderProps) {
  // Count checked children directly from block props
  const childItems = block.children?.filter((c) => c.type === 'checklistItem') ?? [];
  const checkedCount = childItems.filter((c) => c.props.checked).length;
  const totalCount = childItems.length;

  const toggleCollapsed = () => {
    (editor as any).updateBlock(block as any, {
      props: { collapsed: !block.props.collapsed },
    });
  };

  const handleTitleChange = (e: React.FocusEvent<HTMLSpanElement>) => {
    const newTitle = e.currentTarget.textContent ?? '';
    if (newTitle !== block.props.title) {
      (editor as any).updateBlock(block as any, {
        props: { title: newTitle },
      });
    }
  };

  return (
    <div className="checklist-group" data-collapsed={block.props.collapsed}>
      <div className="checklist-group-header" contentEditable={false}>
        <button type="button" className="checklist-group-toggle" onClick={toggleCollapsed}>
          {block.props.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <span
          className="checklist-group-title"
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleChange}
        >
          {block.props.title || 'Todos'}
        </span>
        {totalCount > 0 && (
          <span className="checklist-group-progress">
            <span className="text-success">{checkedCount}</span>
            <span className="opacity-50">/</span>
            <span>{totalCount}</span>
          </span>
        )}
      </div>
    </div>
  );
}
