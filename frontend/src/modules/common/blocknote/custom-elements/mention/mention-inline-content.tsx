import { createReactInlineContentSpec } from '@blocknote/react';
import { mentionConfig } from 'shared/utils/blocknote-schema-configs';

export const mentionInlineContent = createReactInlineContentSpec(mentionConfig, {
  render: (props) => {
    const { id, name } = props.inlineContent.props;
    // The id rides on the element so it survives `blocksToHTML`: the server re-derives mentions from the stored HTML, and
    // the `[data-mention-id]` rule in tailwind.css styles it wherever it renders.
    return <span data-mention-id={id}>@ {name}</span>;
  },
});
