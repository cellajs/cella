import { filterSuggestionItems } from '@blocknote/core/extensions';
import { SuggestionMenuController } from '@blocknote/react';
import { getSlashMenuItems } from '~/modules/common/blocknote/blocknote-schema';
import { SlashMenuList } from '~/modules/common/blocknote/custom-slash-menu/slash-menu-list';
import type { CustomBlockNoteMenuProps } from '~/modules/common/blocknote/types';

export function CustomSlashMenu({ editor, allowedTypes, headingLevels }: CustomBlockNoteMenuProps) {
  const slashMenuItems = getSlashMenuItems(editor, allowedTypes, headingLevels);

  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={async (query) => filterSuggestionItems(slashMenuItems, query)}
      suggestionMenuComponent={(props) => <SlashMenuList {...props} originalItemCount={slashMenuItems.length} allowedTypes={allowedTypes} />}
    />
  );
}
