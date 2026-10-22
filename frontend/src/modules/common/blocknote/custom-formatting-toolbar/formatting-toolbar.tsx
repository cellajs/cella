import {
  BasicTextStyleButton,
  CreateLinkButton,
  FileCaptionButton,
  FileDownloadButton,
  FormattingToolbar,
  FormattingToolbarController,
} from '@blocknote/react';
import { FileOpenPreviewButton } from '~/modules/common/blocknote/custom-formatting-toolbar/file-open-preview-button';

function FormattingToolbarContent() {
  return (
    <FormattingToolbar>
      <BasicTextStyleButton basicTextStyle="bold" />
      <BasicTextStyleButton basicTextStyle="italic" />
      <BasicTextStyleButton basicTextStyle="code" />
      <BasicTextStyleButton basicTextStyle="strike" />
      <BasicTextStyleButton basicTextStyle="underline" />
      <FileCaptionButton />
      <FileOpenPreviewButton />
      <FileDownloadButton />
      <CreateLinkButton />
    </FormattingToolbar>
  );
}

export function CustomFormattingToolbar() {
  return <FormattingToolbarController formattingToolbar={FormattingToolbarContent} />;
}
