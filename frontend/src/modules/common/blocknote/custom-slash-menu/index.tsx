import { filterSuggestionItems } from '@blocknote/core';
import { SuggestionMenuController } from '@blocknote/react';

import { getSlashMenuItems } from '~/modules/common/blocknote/blocknote-config';
import { slashMenu } from '~/modules/common/blocknote/custom-slash-menu/custom-slash-menu';
import type { CustomBlockNoteEditor, CustomBlockTypes } from '~/modules/common/blocknote/types';

export const CustomSlashMenu = ({ editor, allowedTypes }: { editor: CustomBlockNoteEditor; allowedTypes: CustomBlockTypes[] }) => {
  const slashMenuItems = getSlashMenuItems(editor, allowedTypes);

  return (
    <SuggestionMenuController
      triggerCharacter={'/'}
      getItems={async (query) => filterSuggestionItems(slashMenuItems, query)}
      suggestionMenuComponent={(props) => slashMenu(props, slashMenuItems.length)}
    />
  );
};
