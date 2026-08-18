// BlockNote has no document-template support (TypeCellOS/BlockNote#2426), so an appendTransaction normalizer pins the first block to a title heading.
import { createExtension, type ExtensionOptions } from '@blocknote/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { TitleLevel } from '~/modules/common/blocknote/types';

const PLUGIN_KEY = new PluginKey('forced-title');

type ForcedTitleOptions = { level?: TitleLevel };

/**
 * Keeps block 0 a heading at the title level, re-normalizing within the same dispatch so appended transactions join the triggering undo step.
 * The layout is `doc > blockGroup > blockContainer+`, so the first block's content node always sits at pos 2.
 */
export const forcedTitleExtension = createExtension(({ options }: ExtensionOptions<ForcedTitleOptions | undefined>) => {
  const level = options?.level ?? 1;
  return {
    key: 'forcedTitle' as const,
    prosemirrorPlugins: [
      new Plugin({
        key: PLUGIN_KEY,
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          // Never "fix" remote Yjs steps locally: every peer would correct and echo, ping-ponging.
          if (transactions.every((tr) => tr.getMeta('y-sync$'))) return null;

          const firstContainer = newState.doc.firstChild?.firstChild;
          const content = firstContainer?.firstChild;
          if (!content) return null;

          const heading = newState.schema.nodes.heading;
          if (content.type === heading && content.attrs.level === level) return null;

          const tr = newState.tr;
          if (content.type === heading) {
            tr.setNodeMarkup(2, heading, { ...content.attrs, level });
          } else if (content.isTextblock) {
            // Attrs of other block types are unknown to heading's spec; defaults fill the rest
            tr.setNodeMarkup(2, heading, { level });
          } else {
            // Non-text first block (e.g. media dragged to the top): insert an empty title above it
            const headingNode = heading.createAndFill({ level });
            const container = headingNode && newState.schema.nodes.blockContainer.createAndFill(null, headingNode);
            if (!container) return null;
            tr.insert(1, container);
          }
          return tr;
        },
      }),
    ],
  };
});
