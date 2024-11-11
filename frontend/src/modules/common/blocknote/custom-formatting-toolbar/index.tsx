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
import { CustomTextAlignSelect } from '~/modules/common/blocknote/custom-formatting-toolbar/custom-align-change';
import { CustomTextStyleSelect } from '~/modules/common/blocknote/custom-formatting-toolbar/custom-text-type-change';
import type { CustomFormatToolBarConfig } from '~/modules/common/blocknote/types';
import { CustomBlockTypeSelect } from './custom-block-type-change';

export const CustomFormattingToolbar = ({ config }: { config: CustomFormatToolBarConfig }) => (
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
          {config.blockTypeSelect && <CustomBlockTypeSelect />}
          {config.blockStyleSelect && <CustomTextStyleSelect />}
          {config.blockAlignSelect && <CustomTextAlignSelect />}

          {config.fileCaption && <FileCaptionButton key={'fileCaptionButton'} />}
          {config.replaceFile && <FileReplaceButton key={'replaceFileButton'} />}
          <FileDownloadButton key={'downloadButton'} />

          {config.textColorSelect && <ColorStyleButton key={'colorStyleButton'} />}

          {config.createLink && <CreateLinkButton key={'createLinkButton'} />}

          {config.blockNestingSelect && (
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
