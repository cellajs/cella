import { SuggestionMenuController } from '@blocknote/react';
import { getNotifyItems } from '~/modules/common/blocknote/custom-elements/notify';
import { slashMenu } from '~/modules/common/blocknote/custom-slash-menu/custom-slash-menu';
import type { CustomBlockNoteSchema, FileTypesNames } from '~/modules/common/blocknote/types';

export const CustomSlashMenu = ({ editor, allowedFilePanelTypes }: { editor: CustomBlockNoteSchema; allowedFilePanelTypes: FileTypesNames[] }) => (
  <SuggestionMenuController
    triggerCharacter={'/'}
    getItems={async (query) => getNotifyItems(query, editor)}
    suggestionMenuComponent={(props) => slashMenu(props, editor, allowedFilePanelTypes)}
  />
);
