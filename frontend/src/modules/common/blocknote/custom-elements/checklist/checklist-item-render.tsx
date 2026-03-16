import type { BlockNoteEditor } from '@blocknote/core';
import { useExtensionState } from '@blocknote/react';
import { useEffect } from 'react';
import { nanoid } from 'shared/nanoid';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { checkboxesExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';

interface ChecklistItemRenderProps {
  block: {
    id: string;
    props: {
      checkboxId: string;
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
      editor.updateBlock(block as any, { props: { checkboxId: nanoid(12) } });
      return;
    }

    // Detect duplicate checkboxIds (from block split — both halves get the same props)
    for (const b of editor.document) {
      if (b.type !== 'checklistItem') continue;
      if ((b.props as { checkboxId?: string }).checkboxId !== id) continue;
      if (b.id === block.id) break; // We're the first occurrence — keep our ID
      // Another block above us has the same checkboxId — assign a fresh one
      editor.updateBlock(block as any, { props: { checkboxId: nanoid(12) } });
      break;
    }
  }, [block.id, block.props.checkboxId, editor]);

  const { checkboxes, persisted } = useExtensionState(checkboxesExtension, { editor });
  const entry = checkboxes?.find((c) => c.id === block.props.checkboxId);
  const isChecked = entry?.checked ?? false;
  // Checkbox is disabled until the task is persisted (set via extension options from content.tsx)
  const isPersisted = persisted;

  const handleToggle = () => {
    if (!isPersisted) return;
    // Update extension store immediately for instant visual feedback
    const ext = editor.getExtension(checkboxesExtension);
    const newChecked = !isChecked;
    if (ext?.store) {
      const current = ext.store.state.checkboxes;
      const exists = current.some((cb) => cb.id === block.props.checkboxId);
      ext.store.setState((prev) => ({
        ...prev,
        checkboxes: exists
          ? current.map((cb) => (cb.id === block.props.checkboxId ? { ...cb, checked: newChecked } : cb))
          : [...current, { id: block.props.checkboxId, checked: newChecked }],
      }));
    }

    // Persist to backend via custom event
    dispatchCustomEvent('toggleCheckbox', {
      checkboxId: block.props.checkboxId,
      checked: newChecked,
    });
  };

  return (
    <div className="checklist-item" data-checked={isChecked}>
      <div contentEditable={false} className="checklist-checkbox-wrapper">
        <input
          type="checkbox"
          checked={isChecked}
          disabled={!isPersisted}
          onChange={handleToggle}
          data-checkbox-id={block.props.checkboxId}
          className="checklist-checkbox"
        />
      </div>
      <p className={`checklist-content ${isChecked ? 'checklist-checked' : ''}`} ref={contentRef} />
    </div>
  );
}
