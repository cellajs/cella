import { filterSuggestionItems } from '@blocknote/core';
import { SuggestionMenuController } from '@blocknote/react';

import { getSlashMenuItems } from '~/modules/common/blocknote/blocknote-config';
import { slashMenu } from '~/modules/common/blocknote/custom-slash-menu/custom-slash-menu';
import { getSortedSlashMenuItems } from '~/modules/common/blocknote/helpers';
import type { BasicBlockTypes, CellaCustomBlockTypes, CustomBlockNoteSchema } from '~/modules/common/blocknote/types';

export const CustomSlashMenu = ({
  editor,
  allowedTypes,
}: { editor: CustomBlockNoteSchema; allowedTypes: (CellaCustomBlockTypes | BasicBlockTypes)[] }) => {
  const { items, indexedItemCount, originalItemCount } = getSortedSlashMenuItems(getSlashMenuItems(editor), allowedTypes);

  return (
    <SuggestionMenuController
      triggerCharacter={'/'}
      getItems={async (query) => filterSuggestionItems(items, query)}
      suggestionMenuComponent={(props) => slashMenu(props, editor, indexedItemCount, originalItemCount)}
    />
  );
};
