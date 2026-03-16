import { createExtension, defaultProps, getBlockInfoFromTransaction } from '@blocknote/core';
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { type BlockTypeSelectItem, createReactBlockSpec } from '@blocknote/react';
import { CheckSquareIcon } from 'lucide-react';
import { nanoid } from 'shared/nanoid';
import { checkboxesExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';
import { ChecklistItemRender } from '~/modules/common/blocknote/custom-elements/checklist/checklist-item-render';
import type { CustomBlockNoteEditor, IconType } from '~/modules/common/blocknote/types';

// Keyboard shortcuts and input rules for the checklist block (third arg to createReactBlockSpec)
const checklistExtensions = createExtension({
  key: 'checklist-item-shortcuts' as const,
  keyboardShortcuts: {
    Enter: ({ editor }) => {
      // Get block info from ProseMirror transaction for accurate state
      const { blockInfo, selectionEmpty } = editor.transact((tr) => ({
        blockInfo: getBlockInfoFromTransaction(tr),
        selectionEmpty: tr.selection.anchor === tr.selection.head,
      }));

      if (!blockInfo.isBlockContainer) return false;
      if (blockInfo.blockContent.node.type.name !== 'checklistItem' || !selectionEmpty) return false;

      // Empty checklist item → convert to paragraph
      if (blockInfo.blockContent.node.childCount === 0) {
        editor.updateBlock(editor.getTextCursorPosition().block, { type: 'paragraph', props: {} } as any);
        return true;
      }

      // Non-empty → split to create new checklist item below
      if (blockInfo.blockContent.node.childCount > 0) {
        editor.transact((tr) => {
          tr.deleteSelection();
          const pos = tr.selection.from;
          const info = getBlockInfoFromTransaction(tr);
          if (!info.isBlockContainer) return;
          // Empty attrs for both container and content — the new block gets default props
          // (render component auto-assigns a fresh checkboxId when it's empty)
          tr.split(pos, 2, [
            { type: info.bnBlock.node.type, attrs: {} },
            { type: info.blockContent.node.type, attrs: {} },
          ]);
        });
        return true;
      }

      return false;
    },
  },
  inputRules: [
    {
      find: /^\s?\[\s*]\s$/,
      replace: () => ({ type: 'checklistItem' as any, props: { checkboxId: nanoid(12) } }),
    },
    {
      find: /^\s?\[[Xx]]\s$/,
      replace: () => ({ type: 'checklistItem' as any, props: { checkboxId: nanoid(12) } }),
    },
  ],
});

export const checklistItemBlock = createReactBlockSpec(
  {
    type: 'checklistItem' as const,
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      textColor: defaultProps.textColor,
      checkboxId: { default: '' },
    },
    content: 'inline',
  },
  {
    meta: { isolating: false },
    render: (props) => <ChecklistItemRender {...props} />,
    toExternalHTML: ({ block, contentRef, editor }) => {
      const checkboxes = editor.getExtension(checkboxesExtension)?.store?.state?.checkboxes;
      const isChecked = checkboxes?.find((c: { id: string }) => c.id === block.props.checkboxId)?.checked ?? false;
      return (
        <div className="checklist-item" data-checked={isChecked}>
          <div contentEditable={false} className="checklist-checkbox-wrapper">
            <input
              type="checkbox"
              checked={isChecked}
              readOnly
              data-checkbox-id={block.props.checkboxId}
              className="checklist-checkbox"
            />
          </div>
          <p className={`checklist-content ${isChecked ? 'checklist-checked' : ''}`} ref={contentRef} />
        </div>
      );
    },
  },
  [checklistExtensions] as any,
);

// Slash menu item — inserts a checklistItem with a pre-generated checkboxId
export const getChecklistSlashItem = (editor: CustomBlockNoteEditor) => ({
  title: 'Todos',
  key: 'checklistItem',
  onItemClick: () => {
    insertOrUpdateBlockForSlashMenu(editor, {
      type: 'checklistItem' as any,
      props: { checkboxId: nanoid(12) },
    });
  },
  aliases: ['checklist', 'checkbox', 'todo', 'task', 'check', 'todos'],
  group: 'Basic blocks',
  icon: <CheckSquareIcon size={16} />,
});

// Side menu item for block type switching
export const insertSideChecklistItem = (): BlockTypeSelectItem & { oneInstanceOnly?: boolean } => ({
  name: 'Todos',
  type: 'checklistItem' as any,
  icon: CheckSquareIcon as unknown as IconType,
});
