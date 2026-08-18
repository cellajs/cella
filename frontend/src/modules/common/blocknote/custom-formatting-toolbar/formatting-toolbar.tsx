import {
  BasicTextStyleButton,
  ColorStyleButton,
  CreateLinkButton,
  FileCaptionButton,
  FileDownloadButton,
  FormattingToolbar,
  FormattingToolbarController,
  NestBlockButton,
  UnnestBlockButton,
} from '@blocknote/react';
import { customFormattingToolBarConfig } from '~/modules/common/blocknote/blocknote-config';
import { CustomTextAlignSelect } from '~/modules/common/blocknote/custom-formatting-toolbar/custom-align-change';
import { CellaCustomBlockTypeSelect } from '~/modules/common/blocknote/custom-formatting-toolbar/custom-block-type-change';
import { FileOpenPreviewButton } from '~/modules/common/blocknote/custom-formatting-toolbar/open-preview-button';
import type { CustomBlockNoteMenuProps } from '~/modules/common/blocknote/types';

// Extracted as a named component so hooks (useEffect etc.) are valid
function FormattingToolbarContent({
  headingLevels,
  titleLevel,
}: {
  headingLevels: CustomBlockNoteMenuProps['headingLevels'];
  titleLevel?: CustomBlockNoteMenuProps['titleLevel'];
}) {
  return (
    <FormattingToolbar>
      {customFormattingToolBarConfig.blockTypeSelect && (
        <CellaCustomBlockTypeSelect headingLevels={headingLevels} titleLevel={titleLevel} />
      )}
      {customFormattingToolBarConfig.blockStyleSelect && (
        <>
          <BasicTextStyleButton basicTextStyle="bold" />
          <BasicTextStyleButton basicTextStyle="italic" />
          <BasicTextStyleButton basicTextStyle="code" />
          <BasicTextStyleButton basicTextStyle="strike" />
          <BasicTextStyleButton basicTextStyle="underline" />
        </>
      )}
      {customFormattingToolBarConfig.blockAlignSelect && <CustomTextAlignSelect />}

      {customFormattingToolBarConfig.fileCaption && <FileCaptionButton key={'fileCaptionButton'} />}
      {customFormattingToolBarConfig.openPreview && <FileOpenPreviewButton key={'openPreviewButton'} />}

      <FileDownloadButton key={'downloadButton'} />

      {customFormattingToolBarConfig.textColorSelect && <ColorStyleButton key={'colorStyleButton'} />}

      {customFormattingToolBarConfig.createLink && <CreateLinkButton key={'createLinkButton'} />}

      {customFormattingToolBarConfig.blockNestingSelect && (
        <>
          <NestBlockButton key={'nestBlockButton'} />
          <UnnestBlockButton key={'unnestBlockButton'} />
        </>
      )}
    </FormattingToolbar>
  );
}

export function CustomFormattingToolbar({
  headingLevels,
  titleLevel,
}: {
  headingLevels: CustomBlockNoteMenuProps['headingLevels'];
  titleLevel?: CustomBlockNoteMenuProps['titleLevel'];
}) {
  return (
    <FormattingToolbarController
      formattingToolbar={() => <FormattingToolbarContent headingLevels={headingLevels} titleLevel={titleLevel} />}
    />
  );
}
