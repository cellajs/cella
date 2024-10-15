import {
  ColorStyleButton,
  CreateLinkButton,
  FileCaptionButton,
  FileReplaceButton,
  FormattingToolbar,
  FormattingToolbarController,
  NestBlockButton,
  UnnestBlockButton,
} from '@blocknote/react';
import { CustomTextAlignSelect } from '~/modules/common/blocknote/custom-formatting-toolbar/custom-align-change';
import { CustomBlockTypeSelect } from '~/modules/common/blocknote/custom-formatting-toolbar/custom-block-type-change';
import { CustomTextStyleSelect } from '~/modules/common/blocknote/custom-formatting-toolbar/custom-text-type-change';
import type { CustomFormatToolBarConfig } from '~/modules/common/blocknote/types';

export const CustomFormattingToolbar = ({ config }: { config: CustomFormatToolBarConfig }) => (
  <FormattingToolbarController
    formattingToolbar={() => (
      <FormattingToolbar>
        {config.blockTypeSelect && <CustomBlockTypeSelect />}
        {config.blockStyleSelect && <CustomTextStyleSelect />}
        {config.blockAlignSelect && <CustomTextAlignSelect />}

        {config.fileCaption && <FileCaptionButton key={'fileCaptionButton'} />}
        {config.replaceFile && <FileReplaceButton key={'replaceFileButton'} />}

        {config.textColorSelect && <ColorStyleButton key={'colorStyleButton'} />}

        {config.createLink && <CreateLinkButton key={'createLinkButton'} />}

        {config.blockNestingSelect && (
          <>
            <NestBlockButton key={'nestBlockButton'} />
            <UnnestBlockButton key={'unnestBlockButton'} />
          </>
        )}
      </FormattingToolbar>
    )}
  />
);
