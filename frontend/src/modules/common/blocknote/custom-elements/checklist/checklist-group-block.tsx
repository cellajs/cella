import { defaultProps } from '@blocknote/core';
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { type BlockTypeSelectItem, createReactBlockSpec } from '@blocknote/react';
import { CheckSquareIcon } from 'lucide-react';
import { ChecklistGroupRender } from '~/modules/common/blocknote/custom-elements/checklist/checklist-group-render';
import type { CustomBlockNoteEditor, IconType } from '~/modules/common/blocknote/types';

export const checklistGroupConfig = {
  type: 'checklistGroup' as const,
  propSchema: {
    textAlignment: defaultProps.textAlignment,
    title: { default: '' as string },
    collapsed: { default: false as boolean },
  },
  content: 'none' as const,
};

export const checklistGroupBlock = createReactBlockSpec(checklistGroupConfig, {
  render: (props) => <ChecklistGroupRender {...props} />,
  toExternalHTML: ({ block }) => {
    return (
      <div className="checklist-group">
        <div className="checklist-group-header">
          <strong>{block.props.title || 'Todos'}</strong>
        </div>
      </div>
    );
  },
});

// Slash menu item to insert a checklistItem
export const getChecklistItemSlashItem = (editor: CustomBlockNoteEditor) => ({
  title: 'Checklist Item',
  key: 'checklistItem',
  onItemClick: () => {
    insertOrUpdateBlockForSlashMenu(editor, {
      type: 'checklistItem' as const,
    });
  },
  aliases: ['checklist', 'checkbox', 'todo', 'task', 'check'],
  group: 'Basic blocks',
  icon: <CheckSquareIcon size={16} />,
});

// Slash menu item to insert a checklistGroup
export const getChecklistGroupSlashItem = (editor: CustomBlockNoteEditor) => ({
  title: 'Checklist Group',
  key: 'checklistGroup',
  onItemClick: () => {
    insertOrUpdateBlockForSlashMenu(editor, {
      // checklistGroup is not yet registered in the global custom schema; cast at the boundary.
      type: 'checklistGroup' as never,
    });
  },
  aliases: ['checklist group', 'task group', 'checkbox group'],
  group: 'Basic blocks',
  icon: <CheckSquareIcon size={16} />,
});

// Side menu item for checklist item
export const insertSideChecklistItem = (): BlockTypeSelectItem & { oneInstanceOnly?: boolean } => ({
  name: 'Checklist Item',
  type: 'checklistItem' as const,
  icon: CheckSquareIcon as unknown as IconType,
});
