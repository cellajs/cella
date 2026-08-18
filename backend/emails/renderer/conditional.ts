import type { Content, Element, Literal, Parents, Root } from 'hast';
import { visitElements } from './visit.js';

interface Match {
  index: number;
  node: Element;
  parent: Parents;
}

// `raw` is an unofficial HAST node rehype uses to pass HTML through verbatim.
interface Raw extends Literal {
  type: 'raw';
  value: string;
}

interface ParentWithRaw {
  children: (Content | Raw)[];
}

/** Replaces `<jsx-email-cond>` elements with conditional comment wrappers, per `data-mso` / `data-expression`. */
export const getConditionalPlugin = async () => {
  return function conditionalPlugin() {
    return function transform(tree: Root) {
      const matches: Match[] = [];
      let headEl: Element | undefined;

      visitElements(tree, (node, index, parent) => {
        if (node.tagName === 'head') headEl = node;

        if (!parent || typeof index !== 'number') return;
        if (node.tagName !== 'jsx-email-cond') return;

        matches.push({ index, node, parent });
      });

      for (const { node, parent, index } of matches) {
        const props = (node.properties || {}) as Record<string, unknown>;
        const msoProp = (props['data-mso'] ?? (props as any).dataMso) as unknown;
        const msoAttr = typeof msoProp === 'undefined' ? void 0 : msoProp === 'false' ? false : Boolean(msoProp);
        const exprRaw = (props['data-expression'] ?? (props as any).dataExpression) as unknown;
        const exprAttr = typeof exprRaw === 'string' ? exprRaw : void 0;
        const headProp = (props['data-head'] ?? (props as any).dataHead) as unknown;
        const toHead = typeof headProp === 'undefined' ? false : headProp === 'false' ? false : Boolean(headProp);

        let openRaw: string | undefined;
        let closeRaw: string | undefined;

        if (msoAttr === false) {
          // Not MSO: <!--[if !mso]><!--> ... <!--<![endif]-->
          openRaw = '<!--[if !mso]><!-->';
          closeRaw = '<!--<![endif]-->';
        } else {
          // MSO / expression path
          const expression = exprAttr || (msoAttr === true ? 'mso' : void 0);
          if (expression) {
            openRaw = `<!--[if ${expression}]>`;
            // Older Outlook/Word parsers need the self-closing `<![endif]/-->` terminator:
            // adjacent comments otherwise spill over.
            closeRaw = '<![endif]/-->';
          }
        }

        // eslint-disable-next-line no-continue
        if (!openRaw || !closeRaw) continue;

        const before: Raw = { type: 'raw', value: openRaw };
        const after: Raw = { type: 'raw', value: closeRaw };
        const children = (node.children || []) as Content[];

        if (toHead && headEl) {
          if (parent === headEl) {
            (parent as ParentWithRaw).children.splice(index, 1, before, ...children, after);
          } else {
            (parent as ParentWithRaw).children.splice(index, 1);
            (headEl as unknown as ParentWithRaw).children.push(before, ...children, after);
          }
        } else {
          (parent as ParentWithRaw).children.splice(index, 1, before, ...children, after);
        }
      }
    };
  };
};
