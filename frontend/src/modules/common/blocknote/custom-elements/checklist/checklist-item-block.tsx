import { createExtension, getBlockInfoFromSelection } from '@blocknote/core';
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { type BlockTypeSelectItem, createReactBlockSpec, type ReactCustomBlockRenderProps, useExtensionState } from '@blocknote/react';
import i18n from 'i18next';
import { SquareCheckBigIcon } from 'lucide-react';
import { useEffect } from 'react';
import { checklistItemConfig } from 'shared/utils/blocknote-schema-configs';
import { nanoid } from 'shared/utils/nanoid';
import { checkedExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';
import type { AnyBlockNoteEditor, CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

const newCheckboxId = () => nanoid(12);

/** The outer `transact` carries `addToHistory: false`, which covers both the Yjs UndoManager and ProseMirror history. */
const updateBlockWithoutHistory = <TEditor extends AnyBlockNoteEditor>(
  editor: TEditor,
  block: Parameters<TEditor['updateBlock']>[0],
  update: Parameters<TEditor['updateBlock']>[1],
) =>
  editor.transact((tr: { setMeta: (key: string, value: boolean) => void }) => {
    tr.setMeta('addToHistory', false);
    editor.updateBlock(block, update);
  });

interface ChecklistItemViewProps {
  checked: boolean;
  checkboxId: string;
  contentRef: (node: HTMLElement | null) => void;
  /** The editor's checkbox toggles the item; the exported HTML's is read-only. */
  input: { readOnly: true } | { disabled: boolean; onChange: () => void };
}

/** A checklist item's markup, in the editor and in exported HTML. */
function ChecklistItemView({ checked, checkboxId, contentRef, input }: ChecklistItemViewProps) {
  return (
    <div className="checklist-item" data-checked={checked}>
      <div contentEditable={false} className="checklist-checkbox-wrapper">
        <input type="checkbox" checked={checked} data-checkbox-id={checkboxId} className="checklist-checkbox" {...input} />
      </div>
      <p className="checklist-content" ref={contentRef} />
    </div>
  );
}

type ChecklistItemRenderProps = ReactCustomBlockRenderProps<typeof checklistItemConfig>;

function ChecklistItemRender({ block, editor, contentRef }: ChecklistItemRenderProps) {
  // Assign a checkboxId when missing or duplicated: an Enter split gives both halves the same props, and the first keeps the id.
  useEffect(() => {
    const id = block.props.checkboxId;
    let needsId = !id;
    if (id) {
      editor.forEachBlock((other) => {
        if (other.type !== 'checklistItem' || other.props.checkboxId !== id) return true;
        needsId = other.id !== block.id;
        return false;
      });
    }
    if (!needsId) return;
    // Defer to avoid flushSync inside React lifecycle
    const timer = setTimeout(() => updateBlockWithoutHistory(editor, block, { props: { checkboxId: newCheckboxId() } }), 0);
    return () => clearTimeout(timer);
  }, [block.id, block.props.checkboxId, editor]);

  const { persisted } = useExtensionState(checkedExtension, { editor });
  const isChecked = block.props.checked ?? false;

  const handleToggle = () => {
    if (!persisted) return;
    // In collaborative mode this block update is a Y.Doc update.
    editor.updateBlock(block, { props: { checked: !isChecked } });
  };

  return (
    <ChecklistItemView
      checked={isChecked}
      checkboxId={block.props.checkboxId}
      contentRef={contentRef}
      input={{ disabled: !persisted, onChange: handleToggle }}
    />
  );
}

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
