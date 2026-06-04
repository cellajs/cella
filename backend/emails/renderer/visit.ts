import type { Element, Parents, Root } from 'hast';

type ElementVisitor = (node: Element, index: number | undefined, parent: Parents | undefined) => void;

/**
 * Minimal, dependency-free replacement for `unist-util-visit`, scoped to the
 * only thing the email render pipeline needs: a depth-first, pre-order walk that
 * calls `visitor` for every `element` node with its index and parent.
 *
 * Visitors must not mutate the tree during the walk — our plugins collect
 * matches first and mutate afterwards, so this stays safe and simple.
 */
export const visitElements = (tree: Root, visitor: ElementVisitor): void => {
  const walk = (node: Root | Element, index: number | undefined, parent: Parents | undefined): void => {
    if (node.type === 'element') visitor(node, index, parent);

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.type === 'element') walk(child, i, node);
    }
  };

  walk(tree, undefined, undefined);
};
