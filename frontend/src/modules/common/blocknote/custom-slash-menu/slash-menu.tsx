import { filterSuggestionItems } from '@blocknote/core/extensions';
import { SuggestionMenuController } from '@blocknote/react';
import { getSlashMenuItems } from '~/modules/common/blocknote/blocknote-config';
import { CustomSlashMenuComponent } from '~/modules/common/blocknote/custom-slash-menu/custom-slash-menu';
import type { CustomBlockNoteMenuProps } from '~/modules/common/blocknote/types';

/** Renders the custom slash menu component. */
export function CustomSlashMenu({ editor, allowedTypes, headingLevels }: CustomBlockNoteMenuProps) {
  const slashMenuItems = getSlashMenuItems(editor, allowedTypes, headingLevels);

  return (
    <SuggestionMenuController
      triggerCharacter={'/'}
      getItems={async (query) => filterSuggestionItems(slashMenuItems, query)}
      suggestionMenuComponent={(props) => (
        <CustomSlashMenuComponent {...props} originalItemCount={slashMenuItems.length} allowedTypes={allowedTypes} />
      )}
    />
  );
}
