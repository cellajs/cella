import { type DefaultReactSuggestionItem, SuggestionMenuController, type SuggestionMenuProps } from '@blocknote/react';
import { useBlockNoteComponents } from '~/modules/common/blocknote/hooks/use-blocknote-components';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { Member } from '~/modules/memberships/types';

type MentionMenuItem = DefaultReactSuggestionItem & { id: string };

/** The members whose name holds the typed query. */
const getMentionMenuItems = (members: Member[], editor: CustomBlockNoteEditor, query: string): MentionMenuItem[] => {
  const typed = query.toLowerCase();
  return members
    .filter(({ name }) => name.toLowerCase().includes(typed))
    .map((member) => ({
      id: member.id,
      title: member.name,
      size: 'small',
      onItemClick: () => {
        editor.insertInlineContent([{ type: 'mention', props: { name: member.name, id: member.id, slug: member.slug } }]);
      },
      icon: <EntityAvatar type="user" id={member.id} name={member.name} url={member.thumbnailUrl} className="size-5" />,
    }));
};

/** BlockNote's default list keys its rows by title, and two members can share a name. */
function MentionMenuList({ items, selectedIndex, onItemClick }: SuggestionMenuProps<MentionMenuItem>) {
  const Components = useBlockNoteComponents();
  return (
    <Components.SuggestionMenu.Root id="bn-suggestion-menu" className="bn-suggestion-menu">
      {items.map((item, index) => (
        <Components.SuggestionMenu.Item
          key={item.id}
          id={`bn-suggestion-menu-item-${index}`}
          className="bn-suggestion-menu-item"
          item={item}
          isSelected={index === selectedIndex}
          onClick={() => onItemClick?.(item)}
        />
      ))}
    </Components.SuggestionMenu.Root>
  );
}

interface MentionMenuProps {
  members?: Member[];
  editor: CustomBlockNoteEditor;
}

export function MentionMenu({ members, editor }: MentionMenuProps) {
  if (!members?.length) return null;
  return (
    <SuggestionMenuController
      triggerCharacter="@"
      getItems={async (query: string) => getMentionMenuItems(members, editor, query)}
      suggestionMenuComponent={MentionMenuList}
      minQueryLength={0}
    />
  );
}
