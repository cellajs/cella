import {
  BasicTextStyleButton,
  CreateLinkButton,
  FormattingToolbar,
  FormattingToolbarController,
  useBlockNoteEditor,
  useSelectedBlocks,
} from '@blocknote/react';
import { customSchema } from '~/modules/common/blocknote/blocknote-schema';
import { isMediaBlock } from '~/modules/common/blocknote/types';

/** Text styles and links. A selected file shows no toolbar: its actions are on the file itself. */
function FormattingToolbarContent() {
  const editor = useBlockNoteEditor(customSchema);
  const selectedBlocks = useSelectedBlocks(editor);
  if (selectedBlocks.length === 1 && isMediaBlock(selectedBlocks[0])) return null;

  return (
    <FormattingToolbar>
      <BasicTextStyleButton basicTextStyle="bold" />
      <BasicTextStyleButton basicTextStyle="italic" />
      <BasicTextStyleButton basicTextStyle="code" />
      <BasicTextStyleButton basicTextStyle="strike" />
      <BasicTextStyleButton basicTextStyle="underline" />
      <CreateLinkButton />
    </FormattingToolbar>
  );
}

export function CustomFormattingToolbar() {
  return <FormattingToolbarController formattingToolbar={FormattingToolbarContent} />;
}
