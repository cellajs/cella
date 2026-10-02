import i18n from 'i18next';
import type { ProductEntityType } from 'shared';
import * as Y from 'yjs';
import type { TKey } from '~/lib/i18n-locales';
import { getRegisteredProductEntityTypes } from '~/query/basic/entity-query-registry';
import { findInCache } from '~/query/basic/find-in-list-cache';

/** The fragment a collaborative editor binds in its document; yjs-connections.ts opens the same one. */
export const YDOC_FRAGMENT = 'document-store';

/** How much of a first line a label quotes. */
const MAX_LINE_LENGTH = 60;

/** The first line of text in a document's fragment, depth first; null when it holds no text. */
export function firstLineOf(node: Y.XmlFragment | Y.XmlElement): string | null {
  for (const child of node.toArray()) {
    let text: string | null = null;
    if (child instanceof Y.XmlText) {
      const delta = child.toDelta() as { insert?: unknown }[];
      text =
        delta
          .map((op) => (typeof op.insert === 'string' ? op.insert : ''))
          .join('')
          .trim() || null;
    } else if (child instanceof Y.XmlElement) {
      text = firstLineOf(child);
    }
    if (text) return text;
  }
  return null;
}

/** The first line of the document the updates build. */
export function firstLineOfUpdates(updates: Uint8Array[]): string | null {
  const doc = new Y.Doc();
  try {
    for (const update of updates) Y.applyUpdate(doc, update);
    return firstLineOf(doc.getXmlFragment(YDOC_FRAGMENT));
  } finally {
    doc.destroy();
  }
}

/** An entity's name as the query cache holds it. Without a type, each registered product type is tried: ids are unique. */
export function cachedEntityName(entityId: string, entityType?: ProductEntityType): string | null {
  for (const type of entityType ? [entityType] : getRegisteredProductEntityTypes()) {
    const name = findInCache<{ id: string; name?: unknown }>(type, entityId)?.name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return null;
}

/** How a notice or a list names a document: the entity's cached name, else its first line quoted, else its type. */
export function yDocLabel({ entityId, entityType, firstLine }: { entityId: string; entityType?: ProductEntityType; firstLine?: string | null }) {
  const name = cachedEntityName(entityId, entityType);
  if (name) return name;
  if (firstLine) return `“${firstLine.length > MAX_LINE_LENGTH ? `${firstLine.slice(0, MAX_LINE_LENGTH).trimEnd()}…` : firstLine}”`;
  return entityType ? i18n.t(`c:${entityType}` as TKey) : i18n.t('c:unknown');
}
