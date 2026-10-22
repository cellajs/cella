import { type ReactCustomBlockRenderProps, useExtensionState } from '@blocknote/react';
import { useEffect } from 'react';
import type { checklistItemConfig } from 'shared/utils/blocknote-schema-configs';
import { nanoid } from 'shared/utils/nanoid';
import { checkedExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';
import { updateBlockWithoutHistory } from '~/modules/common/blocknote/helpers/blocknote-helpers';

type ChecklistItemRenderProps = ReactCustomBlockRenderProps<typeof checklistItemConfig>;

export const newCheckboxId = () => nanoid(12);

interface ChecklistItemViewProps {
  checked: boolean;
  checkboxId: string;
  contentRef: (node: HTMLElement | null) => void;
  /** The editor's checkbox toggles the item; the exported HTML's is read-only. */
  input: { readOnly: true } | { disabled: boolean; onChange: () => void };
}

/** A checklist item's markup, in the editor and in exported HTML. */
export function ChecklistItemView({ checked, checkboxId, contentRef, input }: ChecklistItemViewProps) {
  return (
    <div className="checklist-item" data-checked={checked}>
      <div contentEditable={false} className="checklist-checkbox-wrapper">
        <input type="checkbox" checked={checked} data-checkbox-id={checkboxId} className="checklist-checkbox" {...input} />
      </div>
      <p className="checklist-content" ref={contentRef} />
    </div>
  );
}

export function ChecklistItemRender({ block, editor, contentRef }: ChecklistItemRenderProps) {
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
    // Defer to avoid flushSync inside React lifecycle
    if (needsId) setTimeout(() => updateBlockWithoutHistory(editor, block, { props: { checkboxId: newCheckboxId() } }), 0);
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
