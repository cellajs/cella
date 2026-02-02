import { useBlockNoteEditor, useComponentsContext, useSelectedBlocks } from '@blocknote/react';
import { ScalingIcon } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { openAttachment } from '~/modules/common/blocknote/helpers/open-attachment';

export const FileOpenPreviewButton = () => {
  const ref = useRef(null);
  const editor = useBlockNoteEditor(customSchema);
  // biome-ignore lint/style/noNonNullAssertion: required by author
  const Components = useComponentsContext()!;

  const selectedBlocks = useSelectedBlocks(editor);

  const selectedFileBlock = useMemo(() => {
    if (selectedBlocks.length !== 1) return null;
    const block = selectedBlocks[0];
    return block.type === 'file' || block.type === 'image' || block.type === 'video' || block.type === 'audio'
      ? block
      : null;
  }, [selectedBlocks]);

  if (!selectedFileBlock) return null;

  // Get the URL of the selected block to open carousel at that item
  const blockUrl = 'url' in selectedFileBlock.props ? (selectedFileBlock.props.url as string) : undefined;

  return (
    <Components.FormattingToolbar.Button
      className={'bn-button'}
      onClick={() => openAttachment(editor, ref, blockUrl)}
      mainTooltip={'Open attachment preview'}
      label={'Open attachment preview'}
      icon={<ScalingIcon size={14} />}
    />
  );
};
