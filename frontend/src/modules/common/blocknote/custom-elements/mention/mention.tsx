import { createReactInlineContentSpec, type DefaultReactGridSuggestionItem } from '@blocknote/react';
import { mentionConfig } from 'shared/utils/blocknote-schema-configs';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { Member } from '~/modules/memberships/types';

export const MentionSchema = createReactInlineContentSpec(mentionConfig, {
  render: (props) => {
    const { id, name } = props.inlineContent.props;

    // The id is carried on the element so it survives `blocksToHTML`; stored HTML is what
    // the server re-derives mentions from.
    const mentionContent = (
      <span
        data-mention-id={id}
        className="inline-flex items-center gap-1 rounded border-none bg-muted px-1.5 py-0.5 font-semibold text-[0.875em] text-foreground"
      >
        @ {name}
      </span>
    );

    return mentionContent;
  },
});

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
    icon: <EntityAvatar type="user" id={m.id} name={m.name} url={m.thumbnailUrl} className="h-5 w-5 text-xs" />,
  }));
};
