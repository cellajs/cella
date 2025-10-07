import { useBlockNoteEditor, useComponentsContext, useSelectedBlocks } from '@blocknote/react';
import { Scaling } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { openAttachment } from '~/modules/common/blocknote/helpers/open-attachment';

export const FileOpenPreviewButton = () => {
  const ref = useRef(null);
  const editor = useBlockNoteEditor(customSchema);
  // biome-ignore lint/style/noNonNullAssertion: required by author
  const Components = useComponentsContext()!;

  const selectedBlocks = useSelectedBlocks(editor);
  const showButton = useMemo(() => {
    // Checks if only one block is selected.
    if (selectedBlocks.length !== 1) return false;

    const block = selectedBlocks[0];

    return block.type === 'file';
  }, [editor, selectedBlocks]);

  if (!showButton) return null;
  return (
    <Components.FormattingToolbar.Button
      className={'bn-button'}
      onClick={(event) => openAttachment(event, editor, ref)}
      mainTooltip={'Open attachment preview'}
      label={'Open attachment preview'}
      icon={<Scaling size={14} />}
    />
  );
};
