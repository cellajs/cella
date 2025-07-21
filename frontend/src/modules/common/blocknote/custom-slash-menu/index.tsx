import { filterSuggestionItems } from '@blocknote/core';
import { SuggestionMenuController } from '@blocknote/react';

import { getSlashMenuItems } from '~/modules/common/blocknote/blocknote-config';
import { slashMenu } from '~/modules/common/blocknote/custom-slash-menu/custom-slash-menu';
import type { CommonBlockNoteProps, CustomBlockNoteEditor, CustomBlockTypes } from '~/modules/common/blocknote/types';

export const CustomSlashMenu = ({
  editor,
  allowedTypes,
  headingLevels,
}: {
  editor: CustomBlockNoteEditor;
  allowedTypes: CustomBlockTypes[];
  headingLevels: NonNullable<CommonBlockNoteProps['headingLevels']>;
}) => {
  const slashMenuItems = getSlashMenuItems(editor, allowedTypes, headingLevels);

  return (
    <SuggestionMenuController
      triggerCharacter={'/'}
      getItems={async (query) => filterSuggestionItems(slashMenuItems, query)}
      suggestionMenuComponent={(props) => slashMenu(props, slashMenuItems.length, allowedTypes)}
    />
  );
};
