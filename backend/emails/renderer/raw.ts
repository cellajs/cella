import type { Comment, Content, Element, Literal, Parents, Root } from 'hast';
import { visitElements } from './visit.js';

interface Match {
  index: number;
  node: Element;
  parent: Parents;
}

interface ParentWithRaw {
  children: (Content | Raw)[];
}

// `raw` is an unofficial HAST node used by rehype to pass through HTML verbatim.
// Model it locally to avoid `any` casts while keeping the rest of the tree typed.
interface Raw extends Literal {
  type: 'raw';
  value: string;
}

const START_TAG = '__COMMENT_START';
const END_TAG = '__COMMENT_END';
export function escapeForRawComponent(input: string): string {
  // escape comment sequences (browsers also treat `--!>` as a comment terminator)
  return input.replace(/<!--/g, START_TAG).replace(/--!?>/g, END_TAG);
}

export function unescapeForRawComponent(input: string): string {
  return input.replace(new RegExp(START_TAG, 'g'), '<!--').replace(new RegExp(END_TAG, 'g'), '/-->');
}

/** Replaces `<jsx-email-raw><!--...--></jsx-email-raw>` with a raw node holding the unescaped content. */
export const getRawPlugin = async () => {
  return function rawPlugin() {
    return function transform(tree: Root) {
      const matches: Match[] = [];

      visitElements(tree, (node, index, parent) => {
        if (!parent || typeof index !== 'number') return;
        if (node.tagName !== 'jsx-email-raw') return;

        matches.push({ index, node, parent });
      });

      for (const { node, parent, index } of matches) {
        // The Raw component renders one HTML comment child holding the escaped content.
        const commentChild = node.children.find((c): c is Comment => c.type === 'comment');

        if (commentChild) {
          const rawHtml = unescapeForRawComponent(commentChild.value);

          // A `raw` node injects HTML verbatim; rehype-stringify needs `allowDangerousHtml: true`.
          const rawNode: Raw = { type: 'raw', value: rawHtml };
          (parent as ParentWithRaw).children.splice(index, 1, rawNode);
        }
      }
    };
  };
};
