import { filterSuggestionItems } from '@blocknote/core';
import { type DefaultReactSuggestionItem, SuggestionMenuController } from '@blocknote/react';

import { getSlashMenuItems } from '~/modules/common/blocknote/blocknote-config';
import { slashMenu } from '~/modules/common/blocknote/custom-slash-menu/custom-slash-menu';
import { getSortedSlashMenuItems } from '~/modules/common/blocknote/helpers/slach-menu';
import type { CustomBlockNoteEditor, CustomBlockTypes, SlashItemKeys } from '~/modules/common/blocknote/types';

export const CustomSlashMenu = ({ editor, allowedTypes }: { editor: CustomBlockNoteEditor; allowedTypes: CustomBlockTypes[] }) => {
  const slashMenuItems = getSlashMenuItems(editor) as (DefaultReactSuggestionItem & { key: SlashItemKeys })[];
  const { items, indexedItemCount, originalItemCount } = getSortedSlashMenuItems(slashMenuItems, allowedTypes);

  return (
    <SuggestionMenuController
      triggerCharacter={'/'}
      getItems={async (query) => filterSuggestionItems(items, query)}
      suggestionMenuComponent={(props) => slashMenu(props, indexedItemCount, originalItemCount)}
    />
  );
};
