import { filterSuggestionItems } from '@blocknote/core/extensions';
import { SuggestionMenuController } from '@blocknote/react';
import { getSlashMenuItems } from '~/modules/common/blocknote/blocknote-config';
import { CustomSlashMenuComponent } from '~/modules/common/blocknote/custom-slash-menu/custom-slash-menu';
import type { CustomBlockNoteMenuProps } from '~/modules/common/blocknote/types';

export const CustomSlashMenu = ({ editor, allowedTypes, headingLevels }: CustomBlockNoteMenuProps) => {
  const slashMenuItems = getSlashMenuItems(editor, allowedTypes, headingLevels);

  return (
    <SuggestionMenuController
      triggerCharacter={'/'}
      getItems={async (query) => filterSuggestionItems(slashMenuItems, query)}
      floatingUIOptions={{
        useDismissProps: {
          // The menu content is portaled to document.body to escape overflow:hidden
          // and transform stacking contexts. Without this guard, floating-ui's
          // useDismiss treats clicks on the portaled menu as "outside" clicks.
          outsidePress: (e) => !(e.target as HTMLElement)?.closest?.(`[data-slash-menu-portal]`),
        },
      }}
      suggestionMenuComponent={(props) => (
        <CustomSlashMenuComponent {...props} originalItemCount={slashMenuItems.length} allowedTypes={allowedTypes} />
      )}
    />
  );
};
