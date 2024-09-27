import { GridSuggestionMenuController } from '@blocknote/react';
import { getMentionMenuItems } from '~/modules/common/blocknote/custom-elements/mention/mention';
import type { CustomBlockNoteSchema } from '~/modules/common/blocknote/types';
import type { Member } from '~/types/common';

export const Mention = ({ members, editor }: { members?: Member[]; editor: CustomBlockNoteSchema }) => {
  if (!members || members.length === 0) return;
  return (
    <GridSuggestionMenuController
      triggerCharacter={'@'}
      getItems={async () =>
        getMentionMenuItems(members, editor).map((item) => ({
          ...item,
          title: item.id,
        }))
      }
      columns={2}
      minQueryLength={0}
    />
  );
};
