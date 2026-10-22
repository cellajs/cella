import { createReactInlineContentSpec } from '@blocknote/react';
import { mentionConfig } from 'shared/utils/blocknote-schema-configs';

export const mentionInlineContent = createReactInlineContentSpec(mentionConfig, {
  render: (props) => {
    const { id, name } = props.inlineContent.props;

    // The id is carried on the element so it survives `blocksToHTML`; stored HTML is what
    // the server re-derives mentions from.
    const mentionContent = (
      <span data-mention-id={id} className="inline-flex rounded bg-muted px-1.5 py-0.5 font-semibold text-[0.875em] text-foreground">
        @ {name}
      </span>
    );

    return mentionContent;
  },
});
