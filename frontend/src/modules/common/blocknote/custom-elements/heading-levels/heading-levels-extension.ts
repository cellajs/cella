import { createExtension, type ExtensionOptions } from '@blocknote/core';
import { type EditorState, Plugin, PluginKey } from 'prosemirror-state';

const pluginKey = new PluginKey('heading-levels');

type PMNode = EditorState['doc'];

interface HeadingLevelsOptions {
  levels: number[];
}

/** The allowed level nearest to `level`; a tie goes to the smaller heading. */
const nearestLevel = (levels: number[], level: number) =>
  levels.reduce((best, next) => {
    const distance = Math.abs(next - level) - Math.abs(best - level);
    return distance < 0 || (distance === 0 && next > best) ? next : best;
  });

/** Headings outside `levels`, keyed by block id and level. Inline content is not walked. */
const headingsOutside = (doc: PMNode, levels: number[]) => {
  const found: { pos: number; key: string; level: number }[] = [];
  doc.descendants((node, pos, parent) => {
    if (node.type.name === 'heading' && !levels.includes(node.attrs.level)) {
      found.push({ pos, key: `${parent?.attrs.id}:${node.attrs.level}`, level: node.attrs.level });
    }
    return !node.isTextblock;
  });
  return found;
};

/**
 * Holds headings to the editor's levels, whichever way one is made: paste, drop, the `#` shortcut, a key binding.
 * The schema keeps every level, as it is shared with the Yjs relay and title documents, so this moves a heading a local
 * change makes to the nearest allowed level. A heading already outside them stays until its level changes.
 */
export const headingLevelsExtension = createExtension(({ options }: ExtensionOptions<HeadingLevelsOptions>) => ({
  key: 'headingLevels' as const,
  prosemirrorPlugins: [
    new Plugin({
      key: pluginKey,
      appendTransaction: (transactions, oldState, newState) => {
        // Never rewrite remote Yjs steps: each peer would answer the other's document
        if (!transactions.some((tr) => tr.docChanged && !tr.getMeta('y-sync$'))) return null;
        const outside = headingsOutside(newState.doc, options.levels);
        if (!outside.length) return null;
        const kept = new Set(headingsOutside(oldState.doc, options.levels).map(({ key }) => key));
        const tr = newState.tr;
        for (const { pos, key, level } of outside) {
          if (!kept.has(key)) tr.setNodeAttribute(pos, 'level', nearestLevel(options.levels, level));
        }
        return tr.docChanged ? tr : null;
      },
    }),
  ],
}));
