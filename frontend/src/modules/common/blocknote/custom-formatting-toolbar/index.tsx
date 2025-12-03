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
import { useEffect } from 'react';
import { customFormattingToolBarConfig } from '~/modules/common/blocknote/blocknote-config';
import { CustomTextAlignSelect } from '~/modules/common/blocknote/custom-formatting-toolbar/custom-align-change';
import { CellaCustomBlockTypeSelect } from '~/modules/common/blocknote/custom-formatting-toolbar/custom-block-type-change';
import { FileOpenPreviewButton } from '~/modules/common/blocknote/custom-formatting-toolbar/open-preview-button';
import type { CustomBlockNoteMenuProps } from '~/modules/common/blocknote/types';

export const CustomFormattingToolbar = ({ headingLevels }: { headingLevels: CustomBlockNoteMenuProps['headingLevels'] }) => (
  <FormattingToolbarController
    formattingToolbar={() => {
      // to be able to use in sheet
      useEffect(() => {
        const bodyStyle = document.body.style;
        const pointerEventsOnOpen = bodyStyle.pointerEvents;
        bodyStyle.pointerEvents = 'auto';

        return () => {
          bodyStyle.pointerEvents = pointerEventsOnOpen;
        };
      }, []);
      return (
        <FormattingToolbar>
          {customFormattingToolBarConfig.blockTypeSelect && <CellaCustomBlockTypeSelect headingLevels={headingLevels} />}
          {customFormattingToolBarConfig.blockStyleSelect && <BasicTextStyleButton basicTextStyle={'bold'} />}
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
    }}
  />
);
