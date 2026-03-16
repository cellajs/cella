import type { BlockNoteEditor } from '@blocknote/core';
import { useExtensionState } from '@blocknote/react';
import { useEffect } from 'react';
import { nanoid } from 'shared/nanoid';
import { checkedExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';

interface ChecklistItemRenderProps {
  block: {
    id: string;
    props: {
      checkboxId: string;
      checked: boolean;
    };
  };
  editor: BlockNoteEditor<any, any, any>;
  contentRef: (node: HTMLElement | null) => void;
}

export function ChecklistItemRender({ block, editor, contentRef }: ChecklistItemRenderProps) {
  // Assign a checkboxId if missing OR if duplicated (e.g. block created by pressing Enter to split)
  useEffect(() => {
    const id = block.props.checkboxId;

    if (!id) {
      // Defer to avoid flushSync inside React lifecycle
      setTimeout(() => editor.updateBlock(block as any, { props: { checkboxId: nanoid(12) } }), 0);
      return;
    }

    // Detect duplicate checkboxIds (from block split — both halves get the same props)
    for (const b of editor.document) {
      if (b.type !== 'checklistItem') continue;
      if ((b.props as { checkboxId?: string }).checkboxId !== id) continue;
      if (b.id === block.id) break; // We're the first occurrence — keep our ID
      // Another block above us has the same checkboxId — assign a fresh one
      setTimeout(() => editor.updateBlock(block as any, { props: { checkboxId: nanoid(12) } }), 0);
      break;
    }
  }, [block.id, block.props.checkboxId, editor]);

  const { persisted } = useExtensionState(checkedExtension, { editor });
  const isChecked = block.props.checked ?? false;

  const handleToggle = () => {
    if (!persisted) return;
    // Toggle checked state directly in block props — this is a Y.Doc update when collaborative
    editor.updateBlock(block as any, { props: { checked: !isChecked } });
  };

  return (
    <div className="checklist-item" data-checked={isChecked}>
      <div contentEditable={false} className="checklist-checkbox-wrapper">
        <input
          type="checkbox"
          checked={isChecked}
          disabled={!persisted}
          onChange={handleToggle}
          data-checkbox-id={block.props.checkboxId}
          className="checklist-checkbox"
        />
      </div>
      <p className={`checklist-content ${isChecked ? 'checklist-checked' : ''}`} ref={contentRef} />
    </div>
  );
}
