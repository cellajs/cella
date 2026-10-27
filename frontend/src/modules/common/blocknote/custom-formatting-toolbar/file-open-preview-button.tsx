import { useBlockNoteEditor, useSelectedBlocks } from '@blocknote/react';
import { ScalingIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { customSchema } from '~/modules/common/blocknote/blocknote-schema';
import { openAttachment } from '~/modules/common/blocknote/helpers/open-attachment';
import { useBlockNoteComponents } from '~/modules/common/blocknote/hooks/use-blocknote-components';
import { isMediaBlock } from '~/modules/common/blocknote/types';

export function FileOpenPreviewButton() {
  const { t } = useTranslation();
  const editor = useBlockNoteEditor(customSchema);
  const Components = useBlockNoteComponents();

  const selectedBlocks = useSelectedBlocks(editor);
  const [block] = selectedBlocks;
  if (selectedBlocks.length !== 1 || !isMediaBlock(block)) return null;

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      onClick={() => openAttachment(editor, block.id)}
      mainTooltip={t('c:open_attachment_preview')}
      label={t('c:open_attachment_preview')}
      icon={<ScalingIcon className="size-3.5" />}
    />
  );
}
