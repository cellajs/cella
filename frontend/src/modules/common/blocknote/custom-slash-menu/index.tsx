import { SuggestionMenuController } from '@blocknote/react';
import { getNotifyItems } from '~/modules/common/blocknote/custom-elements/notify';
import { slashMenu } from '~/modules/common/blocknote/custom-slash-menu/custom-slash-menu';
import type { CustomBlockNoteSchema } from '~/modules/common/blocknote/types';

export const CustomSlashMenu = ({ editor }: { editor: CustomBlockNoteSchema }) => (
  <SuggestionMenuController triggerCharacter={'/'} getItems={async (query) => getNotifyItems(query, editor)} suggestionMenuComponent={slashMenu} />
);
