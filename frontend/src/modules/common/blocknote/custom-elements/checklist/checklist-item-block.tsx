import { createExtension, getBlockInfoFromSelection } from '@blocknote/core';
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { type BlockTypeSelectItem, createReactBlockSpec } from '@blocknote/react';
import i18n from 'i18next';
import { SquareCheckBigIcon } from 'lucide-react';
import { checklistItemConfig } from 'shared/utils/blocknote-schema-configs';
import { ChecklistItemRender, ChecklistItemView, newCheckboxId } from '~/modules/common/blocknote/custom-elements/checklist/checklist-item-render';
import type { AnyBlockNoteEditor, CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

/** Empty item becomes a paragraph, a non-empty item splits into a fresh checklist item below; returns true when it handled the key. */
export const handleChecklistItemEnter = (editor: AnyBlockNoteEditor): boolean => {
  const { blockInfo, selectionEmpty } = editor.transact((tr) => ({
    blockInfo: getBlockInfoFromSelection(tr),
    selectionEmpty: tr.selection.anchor === tr.selection.head,
  }));

  if (!blockInfo.hasContent) return false;
  if (blockInfo.content.node.type.name !== 'checklistItem' || !selectionEmpty) return false;

  if (blockInfo.isContentEmpty) {
    editor.updateBlock(editor.getTextCursorPosition().block, { type: 'paragraph', props: {} });
    return true;
  }

  editor.transact((tr) => {
    tr.deleteSelection();
    const pos = tr.selection.from;
    const info = getBlockInfoFromSelection(tr);
    if (!info.hasContent) return;
    // Empty container attrs give the new block default props.
    tr.split(pos, 2, [
      { type: info.block.node.type, attrs: {} },
      { type: info.content.node.type, attrs: { checkboxId: newCheckboxId() } },
    ]);
  });
  // Deferred until React renders the new block; the hop through prevBlock forces a real move, so the DOM selection follows.
  const { block: newItem, prevBlock } = editor.getTextCursorPosition();
  setTimeout(() => {
    if (prevBlock) editor.setTextCursorPosition(prevBlock, 'end');
    editor.setTextCursorPosition(newItem, 'start');
  }, 0);
  return true;
};

/** Turns the block at the cursor into a checklist item; returns false for blocks without inline content. */
const convertToChecklistItem = (editor: AnyBlockNoteEditor): boolean => {
  const { block } = editor.getTextCursorPosition();
  if (editor.schema.blockSchema[block.type].content !== 'inline') return false;
  editor.updateBlock(block, { type: 'checklistItem', props: { checkboxId: newCheckboxId() } });
  return true;
};

const checklistShortcutsExtension = createExtension({
  key: 'checklist-item-shortcuts' as const,
  // BlockNote's own checkListItem stays in the schema, with shortcuts and input rules for the same keys; running first makes them create this block.
  runsBefore: ['check-list-item-shortcuts'],
  keyboardShortcuts: { Enter: ({ editor }) => handleChecklistItemEnter(editor), 'Mod-Shift-9': ({ editor }) => convertToChecklistItem(editor) },
  inputRules: [
    {
      find: /^\s?\[\s*]\s$/,
      replace: () => ({ type: 'checklistItem' as const, props: { checkboxId: newCheckboxId() } }),
    },
    {
      find: /^\s?\[[Xx]]\s$/,
      replace: () => ({ type: 'checklistItem' as const, props: { checkboxId: newCheckboxId(), checked: true } }),
    },
  ],
});

export const checklistItemBlock = createReactBlockSpec(
  checklistItemConfig,
  {
    meta: { isolating: false },
    render: (props) => <ChecklistItemRender {...props} />,
    toExternalHTML: ({ block, contentRef }) => (
      <ChecklistItemView
        checked={block.props.checked ?? false}
        checkboxId={block.props.checkboxId}
        contentRef={contentRef}
        input={{ readOnly: true }}
      />
    ),
  },
  [checklistShortcutsExtension],
);

/** The side menu's type-switch entry: BlockNote's own items name only its `checkListItem`. */
export const getChecklistTypeItem = (): BlockTypeSelectItem => ({ name: i18n.t('c:todos'), type: 'checklistItem', icon: SquareCheckBigIcon });

export const getChecklistSlashItem = (editor: CustomBlockNoteEditor) => ({
  title: i18n.t('c:todos'),
  key: 'checklistItem',
  onItemClick: () => {
    insertOrUpdateBlockForSlashMenu(editor, { type: 'checklistItem' as const, props: { checkboxId: newCheckboxId() } });
  },
  aliases: ['checklist', 'checkbox', 'todo', 'task', 'check', 'todos'],
  icon: <SquareCheckBigIcon />,
});
