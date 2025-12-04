import { createReactInlineContentSpec, type DefaultReactGridSuggestionItem } from '@blocknote/react';
import { Link } from '@tanstack/react-router';
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
      const { name, slug } = props.inlineContent.props;

      const mentionContent = (
        <span
          style={{
            backgroundColor: '#1F2937',
            color: '#FFFFFF',
            borderRadius: '4px',
            padding: '2px 6px',
            fontWeight: '600',
            fontSize: '0.875em',
            border: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          @ {name}
        </span>
      );

      // If slug is available, make it clickable to navigate to user profile
      if (slug) {
        return (
          <Link
            to="/user/$idOrSlug"
            params={{ idOrSlug: slug }}
            style={{ textDecoration: 'none', cursor: 'pointer' }}
            onClick={(e) => e.stopPropagation()}
          >
            {mentionContent}
          </Link>
        );
      }

      return mentionContent;
    },
  },
);

// Function which gets all users for the mentions menu.
export const getMentionMenuItems = (members: Member[], editor: CustomBlockNoteEditor): DefaultReactGridSuggestionItem[] => {
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
