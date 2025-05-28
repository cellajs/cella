import {
  ColorStyleButton,
  CreateLinkButton,
  FileCaptionButton,
  FileDownloadButton,
  FileReplaceButton,
  FormattingToolbar,
  FormattingToolbarController,
  NestBlockButton,
  UnnestBlockButton,
} from '@blocknote/react';
import { useEffect } from 'react';
import { customFormattingToolBarConfig } from '~/modules/common/blocknote/blocknote-config';
import { CustomTextAlignSelect } from '~/modules/common/blocknote/custom-formatting-toolbar/custom-align-change';
import { CellaCustomBlockTypeSelect } from '~/modules/common/blocknote/custom-formatting-toolbar/custom-block-type-change';
import { CustomTextStyleSelect } from '~/modules/common/blocknote/custom-formatting-toolbar/custom-text-type-change';
import { FileOpenPreviewButton } from '~/modules/common/blocknote/custom-formatting-toolbar/open-preview-button';

export const CustomFormattingToolbar = () => (
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
          {customFormattingToolBarConfig.blockTypeSelect && <CellaCustomBlockTypeSelect />}
          {customFormattingToolBarConfig.blockStyleSelect && <CustomTextStyleSelect />}
          {customFormattingToolBarConfig.blockAlignSelect && <CustomTextAlignSelect />}

          {customFormattingToolBarConfig.fileCaption && <FileCaptionButton key={'fileCaptionButton'} />}
          {customFormattingToolBarConfig.replaceFile && <FileReplaceButton key={'replaceFileButton'} />}
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
