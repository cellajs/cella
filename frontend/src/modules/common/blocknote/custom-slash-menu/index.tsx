import { SuggestionMenuController } from '@blocknote/react';

import { getSlashMenuItems } from '~/modules/common/blocknote/blocknote-config';
import { slashMenu } from '~/modules/common/blocknote/custom-slash-menu/custom-slash-menu';

import type { BasicBlockTypes, CellaCustomBlockTypes, CustomBlockNoteSchema } from '~/modules/common/blocknote/types';

export const CustomSlashMenu = ({
  editor,
  allowedTypes,
}: { editor: CustomBlockNoteSchema; allowedTypes: (CellaCustomBlockTypes | BasicBlockTypes)[] }) => (
  <SuggestionMenuController
    triggerCharacter={'/'}
    getItems={async (query) => await getSlashMenuItems(query, editor)}
    suggestionMenuComponent={(props) => slashMenu(props, editor, allowedTypes)}
  />
);
