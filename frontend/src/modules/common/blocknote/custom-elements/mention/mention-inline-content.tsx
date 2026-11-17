import { createReactInlineContentSpec } from '@blocknote/react';
import { mentionConfig } from 'shared/utils/blocknote-schema-configs';

// Both carry the id on the element: the server re-derives mentions from the HTML `blocksToHTML` stores, and the
// `[data-mention-id]` rule in tailwind.css styles it wherever it renders.
export const mentionInlineContent = createReactInlineContentSpec(mentionConfig, {
  render: (props) => {
    const { id, name } = props.inlineContent.props;
    return <span data-mention-id={id}>@ {name}</span>;
  },
  toExternalHTML: (props) => {
    const { id, name } = props.inlineContent.props;
    return <span data-mention-id={id}>@{name}</span>;
  },
});
