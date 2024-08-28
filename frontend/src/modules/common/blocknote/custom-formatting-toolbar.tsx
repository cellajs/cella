import {
  BasicTextStyleButton,
  BlockTypeSelect,
  ColorStyleButton,
  CreateLinkButton,
  FileCaptionButton,
  FileReplaceButton,
  FormattingToolbar,
  FormattingToolbarController,
} from '@blocknote/react';

// Removed text position left|center|right, also remove indentation.
export const CustomFormattingToolbar = () => (
  <div className="fixed">
    <FormattingToolbarController
      formattingToolbar={() => (
        <FormattingToolbar>
          <BlockTypeSelect key={'blockTypeSelect'} />

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
  </div>
);
