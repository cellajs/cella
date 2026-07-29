import { type BlockNoteEditor, createExtension, getBlockInfoFromSelection } from '@blocknote/core';
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { type BlockTypeSelectItem, createReactBlockSpec } from '@blocknote/react';
import { SquareCheckBigIcon } from 'lucide-react';
import { checklistItemConfig } from 'shared/utils/blocknote-schema-configs';
import { nanoid } from 'shared/utils/nanoid';
import { ChecklistItemRender } from '~/modules/common/blocknote/custom-elements/checklist/checklist-item-render';
import type { CustomBlockNoteEditor, IconType } from '~/modules/common/blocknote/types';

// Annotating the handler with CustomBlockNoteEditor would make customSchema reference itself through this
// block spec (TS2502 circular type), so the handler takes a schema-agnostic editor.
// biome-ignore lint/suspicious/noExplicitAny: schema-agnostic editor type; see note above
type AnyBlockNoteEditor = BlockNoteEditor<any, any, any>;

/**
 * Enter behavior for a checklist item: empty item becomes a paragraph, a non-empty item splits into a
 * fresh checklist item below with the caret placed in that new item. Returns true when it handled the key.
 */
export const handleChecklistItemEnter = (editor: AnyBlockNoteEditor): boolean => {
  // Get block info from ProseMirror transaction for accurate state
  const { blockInfo, selectionEmpty } = editor.transact((tr) => ({
    blockInfo: getBlockInfoFromSelection(tr),
    selectionEmpty: tr.selection.anchor === tr.selection.head,
  }));

  if (!blockInfo.isBlockContainer) return false;
  if (blockInfo.blockContent.node.type.name !== 'checklistItem' || !selectionEmpty) return false;

  // Empty checklist item → convert to paragraph
  if (blockInfo.blockContent.node.childCount === 0) {
    editor.updateBlock(editor.getTextCursorPosition().block, { type: 'paragraph', props: {} });
    return true;
  }

  // Non-empty → split to create a new checklist item below.
  editor.transact((tr) => {
    tr.deleteSelection();
    const pos = tr.selection.from;
    const info = getBlockInfoFromSelection(tr);
    if (!info.isBlockContainer) return;
    // Empty attrs for both container and content: the new block gets default props.
    // (render component auto-assigns a fresh checkboxId when it's empty)
    tr.split(pos, 2, [
      { type: info.bnBlock.node.type, attrs: {} },
      { type: info.blockContent.node.type, attrs: { checkboxId: nanoid(12) } },
    ]);
  });
  // The split's ProseMirror selection lands in the new item, but the browser caret stays in the original
  // item until React renders the new block's node, so place the caret after that render (deferred). The
  // caret hop through the previous block makes it a real move: re-setting the block ProseMirror already
  // reports as current is a no-op that would not sync the DOM selection.
  const { block: newItem, prevBlock } = editor.getTextCursorPosition();
  setTimeout(() => {
    if (prevBlock) editor.setTextCursorPosition(prevBlock, 'end');
    editor.setTextCursorPosition(newItem, 'start');
  }, 0);
  return true;
};

// Keyboard shortcuts and input rules for the checklist block (third arg to createReactBlockSpec)
const checklistExtensions = createExtension({
  key: 'checklist-item-shortcuts' as const,
  keyboardShortcuts: {
    Enter: ({ editor }) => handleChecklistItemEnter(editor),
  },
  inputRules: [
    {
      find: /^\s?\[\s*]\s$/,
      replace: () => ({ type: 'checklistItem' as const, props: { checkboxId: nanoid(12) } }),
    },
    {
      find: /^\s?\[[Xx]]\s$/,
      replace: () => ({ type: 'checklistItem' as const, props: { checkboxId: nanoid(12) } }),
    },
  ],
});

// Schema config is shared with the Yjs relay's server-side seeder; see shared/blocknote-schema-configs.
export { checklistItemConfig };

/** Defines the custom BlockNote checklist item. */
export const checklistItemBlock = createReactBlockSpec(
  checklistItemConfig,
  {
    meta: { isolating: false },
    render: (props) => <ChecklistItemRender {...props} />,
    toExternalHTML: ({ block, contentRef }) => {
      const isChecked = block.props.checked ?? false;
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
  [checklistExtensions],
);

// Slash menu item that inserts a checklistItem with a pre-generated checkboxId.
/** Returns the checklist slash item. */
export const getChecklistSlashItem = (editor: CustomBlockNoteEditor) => ({
  title: 'Todos',
  key: 'checklistItem',
  onItemClick: () => {
    insertOrUpdateBlockForSlashMenu(editor, {
      type: 'checklistItem' as const,
      props: { checkboxId: nanoid(12) },
    });
  },
  aliases: ['checklist', 'checkbox', 'todo', 'task', 'check', 'todos'],
  group: 'Basic blocks',
  icon: <SquareCheckBigIcon />,
});

// Side menu item for block type switching
/** Inserts a checklist item from the editor side menu. */
export const insertSideChecklistItem = (): BlockTypeSelectItem & { oneInstanceOnly?: boolean } => ({
  name: 'Todos',
  type: 'checklistItem' as const,
  icon: SquareCheckBigIcon as unknown as IconType,
});
