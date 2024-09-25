import {
  BasicTextStyleButton,
  ColorStyleButton,
  CreateLinkButton,
  FileCaptionButton,
  FileReplaceButton,
  FormattingToolbar,
  FormattingToolbarController,
} from '@blocknote/react';
import { CustomBlockTypeSelect } from '~/modules/common/blocknote/custom-formatting-toolbar/custom-block-type-select';

// Removed text position left|center|right, also remove indentation.
export const CustomFormattingToolbar = () => (
  <FormattingToolbarController
    formattingToolbar={() => (
      <FormattingToolbar>
        <CustomBlockTypeSelect />

        <FileCaptionButton key={'fileCaptionButton'} />
        <FileReplaceButton key={'replaceFileButton'} />

        <BasicTextStyleButton basicTextStyle={'bold'} key={'boldStyleButton'} />
        <BasicTextStyleButton basicTextStyle={'italic'} key={'italicStyleButton'} />
        <BasicTextStyleButton basicTextStyle={'underline'} key={'underlineStyleButton'} />
        <BasicTextStyleButton basicTextStyle={'strike'} key={'strikeStyleButton'} />

        <ColorStyleButton key={'colorStyleButton'} />
        <CreateLinkButton key={'createLinkButton'} />
      </FormattingToolbar>
    )}
  />
);
