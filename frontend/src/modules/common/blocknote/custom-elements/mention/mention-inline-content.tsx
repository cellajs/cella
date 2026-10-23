import { createReactInlineContentSpec } from '@blocknote/react';
import { mentionConfig } from 'shared/utils/blocknote-schema-configs';

export const mentionInlineContent = createReactInlineContentSpec(mentionConfig, {
  render: (props) => {
    const { id, name } = props.inlineContent.props;
    // The id rides on the element so it survives `blocksToHTML`: the server re-derives mentions from the stored HTML.
    return (
      <span data-mention-id={id} className="inline-flex rounded bg-muted px-1.5 py-0.5 font-semibold text-[0.875em] text-foreground">
        @ {name}
      </span>
    );
  },
});
