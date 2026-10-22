import { createExtension } from '@blocknote/core';
import type { ComputeDropPositionContext } from '@blocknote/core/extensions';
import { type EditorState, Plugin, PluginKey } from 'prosemirror-state';

const pluginKey = new PluginKey('pinned-title');

type PMNode = EditorState['doc'];

/** The id of block 0: the layout is `doc > blockGroup > blockContainer+`. */
const firstBlockId = (doc: PMNode): string | undefined => doc.firstChild?.firstChild?.attrs.id;

const hasBlock = (doc: PMNode, id: string) => {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (node.type.name === 'blockContainer' && node.attrs.id === id) found = true;
    return !found;
  });
  return found;
};

/**
 * True when a change displaces block 0: it still exists afterwards but no longer comes first. Moves, drops above it and
 * drags of it all do; deleting or replacing it does not, so clearing or pasting over the document still works.
 */
const displacesFirstBlock = (before: PMNode, after: PMNode) => {
  const titleId = firstBlockId(before);
  if (!titleId || firstBlockId(after) === titleId) return false;
  return hasBlock(after, titleId);
};

/** Drop-cursor hook: no block drop goes above block 0 (position 1 is the start of the top-level block group). */
export const pinnedTitleDropPosition = ({ defaultPosition }: ComputeDropPositionContext): ComputeDropPositionContext['defaultPosition'] =>
  defaultPosition?.orientation === 'block-horizontal' && defaultPosition.pos <= 1 ? null : defaultPosition;

/**
 * Keeps block 0 of a title document (helpers/title-document) first: local changes that would displace it are dropped, whichever
 * command or gesture made them. BlockNote has no document templates (TypeCellOS/BlockNote#2426); the title's block type stays free.
 */
export const pinnedTitleExtension = createExtension(() => ({
  key: 'pinnedTitle' as const,
  prosemirrorPlugins: [
    new Plugin({
      key: pluginKey,
      // Never filter remote Yjs steps: a peer that refused one would drift from the shared document.
      filterTransaction: (tr, state) => !tr.docChanged || !!tr.getMeta('y-sync$') || !displacesFirstBlock(state.doc, tr.doc),
    }),
  ],
}));
