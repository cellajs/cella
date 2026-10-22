import { type DefaultReactGridSuggestionItem, GridSuggestionMenuController } from '@blocknote/react';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { Member } from '~/modules/memberships/types';

/** The members whose name holds the typed query, each shown by avatar and name (the grid item renders only its `icon`). */
const getMentionMenuItems = (members: Member[], editor: CustomBlockNoteEditor, query: string): DefaultReactGridSuggestionItem[] => {
  const typed = query.toLowerCase();
  return members
    .filter(({ name }) => name.toLowerCase().includes(typed))
    .map((member) => ({
      id: member.id,
      onItemClick: () => {
        editor.insertInlineContent([{ type: 'mention', props: { name: member.name, id: member.id, slug: member.slug } }]);
      },
      icon: (
        <>
          <EntityAvatar type="user" id={member.id} name={member.name} url={member.thumbnailUrl} className="size-5" />
          {member.name}
        </>
      ),
    }));
};

interface MentionMenuProps {
  members?: Member[];
  editor: CustomBlockNoteEditor;
}

export function MentionMenu({ members, editor }: MentionMenuProps) {
  if (!members?.length) return null;
  return (
    <GridSuggestionMenuController
      triggerCharacter="@"
      getItems={async (query) => getMentionMenuItems(members, editor, query)}
      columns={2}
      minQueryLength={0}
    />
  );
}
