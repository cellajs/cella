import type { Element, Parents, Root } from 'hast';

type ElementVisitor = (node: Element, index: number | undefined, parent: Parents | undefined) => void;

/**
 * Dependency-free replacement for `unist-util-visit`: a depth-first, pre-order
 * walk calling `visitor` for every `element` node with its index and parent.
 *
 * Visitors must not mutate the tree mid-walk — plugins collect matches first,
 * then mutate afterwards.
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
