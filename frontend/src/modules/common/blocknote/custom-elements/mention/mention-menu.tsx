import { GridSuggestionMenuController } from '@blocknote/react';
import { getMentionMenuItems } from '~/modules/common/blocknote/custom-elements/mention/mention';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';
import type { Member } from '~/modules/memberships/types';

export function Mention({ members, editor }: { members?: Member[]; editor: CustomBlockNoteEditor }) {
  if (!members?.length) return null;
  return (
    <GridSuggestionMenuController
      triggerCharacter={'@'}
      getItems={async (query) => getMentionMenuItems(members, editor, query)}
      columns={2}
      minQueryLength={0}
    />
  );
}
