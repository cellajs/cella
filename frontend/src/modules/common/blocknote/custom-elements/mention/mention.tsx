import { createReactInlineContentSpec, type DefaultReactGridSuggestionItem } from '@blocknote/react';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';
import type { Member } from '~/modules/memberships/types';

// The Mention inline content.
export const MentionSchema = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: {
      id: {
        default: 'Unknown',
      },
      slug: {
        default: 'Unknown',
      },
      name: {
        default: 'Unknown',
      },
    },
    content: 'none',
  },
  {
    render: (props) => {
      const { name } = props.inlineContent.props;

      const mentionContent = (
        <span className="bg-muted text-foreground rounded px-1.5 py-0.5 font-semibold text-[0.875em] border-none inline-flex items-center gap-1">
          @ {name}
        </span>
      );

      return mentionContent;
    },
  },
);

// Function which gets all users for the mentions menu.
export const getMentionMenuItems = (
  members: Member[],
  editor: CustomBlockNoteEditor,
): DefaultReactGridSuggestionItem[] => {
  return members.map((m) => ({
    id: m.id,
    onItemClick: () => {
      editor.insertInlineContent([
        {
          type: 'mention',
          props: {
            name: m.name,
            id: m.id,
            slug: m.slug,
          },
        },
      ]);
    },
    icon: <AvatarWrap type="user" id={m.id} name={m.name} url={m.thumbnailUrl} className="h-5 w-5 text-xs" />,
  }));
};
