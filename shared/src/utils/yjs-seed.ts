import { type Block, BlockNoteEditor, type PartialBlock } from '@blocknote/core';
import { blocksToYXmlFragment, yDocToBlocks } from '@blocknote/core/yjs';
import { digest } from 'lib0/hash/sha256';
import * as Y from 'yjs';
import type { YjsDocKey } from '../../types.ts';
import { serverBlockNoteSchema } from './blocknote-server-schema.ts';
import { yjsFragmentName } from './yjs-protocol.ts';

const createSeedEditor = () => BlockNoteEditor.create({ schema: serverBlockNoteSchema, _headless: true });

let seedEditor: ReturnType<typeof createSeedEditor> | undefined;

/** One headless editor for every seed, built on first use: schema construction is expensive and conversions are stateless. */
const editor = () => {
  seedEditor ??= createSeedEditor();
  return seedEditor;
};

type SeedSchema = ReturnType<typeof createSeedEditor>['schema'];
export type SeedBlock = PartialBlock<SeedSchema['blockSchema'], SeedSchema['inlineContentSchema'], SeedSchema['styleSchema']>;
type FullBlock = Block<SeedSchema['blockSchema'], SeedSchema['inlineContentSchema'], SeedSchema['styleSchema']>;

/**
 * The empty document: one empty paragraph, under the id BlockNote gives the first block of a collaborative document.
 * A null write onto a document seeded from null then changes nothing.
 */
const emptyDocument = (): SeedBlock[] => [{ id: 'initialBlockId', type: 'paragraph' }];

/**
 * The blocks a stored description holds, or the empty document for none (null, empty, `[]`): from an empty fragment,
 * two concurrent first writers create two top-level block groups, of which the editor shows one. Throws when the
 * description is not a JSON array.
 */
export function parseDescription(description: string | null): SeedBlock[] {
  if (!description) return emptyDocument();
  const blocks: unknown = JSON.parse(description);
  if (!Array.isArray(blocks)) throw new Error('A description is a JSON array of blocks');
  return blocks.length === 0 ? emptyDocument() : blocks;
}

/** Changing it changes every seed and generation from then on, which a change to how seeds are built needs. */
const seedFormat = 'yjs-seed-1';

/** The first state of a document: its description as one Yjs update, written under `clientID`. */
function encodeSeed(blocks: SeedBlock[], clientID: number): Uint8Array {
  const doc = new Y.Doc();
  doc.clientID = clientID;
  try {
    // The fragment converter types full blocks; it fills a partial block's defaults.
    doc.transact(() => blocksToYXmlFragment(editor(), blocks as FullBlock[], doc.getXmlFragment(yjsFragmentName)));
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}

/** A version 8 UUID of 16 hash bytes: the generation column and its schemas take a UUID. */
function uuidFromBytes(bytes: Uint8Array): string {
  const b = Uint8Array.from(bytes.subarray(0, 16));
  const view = new DataView(b.buffer);
  view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x80);
  view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80);
  const hex = Array.from(b, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A document's first state and the generation that names it. */
export interface YjsSeed {
  state: Uint8Array;
  generation: string;
}

/**
 * The seed of a document, built alike by the server and by an offline client: either may start the document. Two seeds
 * of one entity with one generation are byte-identical and merge as one history. The seed's Yjs client id and its
 * generation come from a hash of the entity and of the seed's own bytes. A description that converts differently
 * (another text, another BlockNote or Yjs version) gets another generation, which keeps the two histories apart.
 * Throws when the description does not convert: not a blocks array, or a block or inline type the server schema lacks.
 */
export function buildYjsSeed({ entityType, entityId }: Pick<YjsDocKey, 'entityType' | 'entityId'>, description: string | null): YjsSeed {
  const blocks = parseDescription(description);
  const content = encodeSeed(blocks, 0);
  const prefix = new TextEncoder().encode(`${seedFormat}:${entityType}:${entityId}:`);
  const input = new Uint8Array(prefix.length + content.length);
  input.set(prefix);
  input.set(content, prefix.length);
  const hash = digest(input);
  // Never 0, the client id the content hash was taken under.
  const clientID = new DataView(hash.buffer, hash.byteOffset).getUint32(0) || 1;
  return { state: encodeSeed(blocks, clientID), generation: uuidFromBytes(hash.subarray(16)) };
}

/** The description a document holds, as the entity stores it: its blocks as JSON. Throws when the document does not convert. */
export const descriptionOf = (doc: Y.Doc): string => JSON.stringify(yDocToBlocks(editor(), doc, yjsFragmentName));

const sameBlock = (a: unknown, b: unknown) => (a === undefined || b === undefined ? a === b : JSON.stringify(a) === JSON.stringify(b));
const sameBlocks = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((block, i) => sameBlock(block, b[i]));

/**
 * Merges top-level blocks three ways by id: each block `local` changed, added or removed since `base` goes into `server`,
 * the rest of `server` stays. A nested block counts as part of its top-level block. A block added locally goes after the
 * nearest block before it that the result holds.
 * @returns The merged blocks; `server` itself when `local` changed nothing. Null when the server changed a block `local`
 * changed too, or when `local` reordered blocks and the server changed anything.
 */
export function mergeBlocks<T extends { id?: string }>(base: T[], local: T[], server: T[]): T[] | null {
  if (sameBlocks(local, base)) return server;
  if (sameBlocks(server, base)) return local;

  const byId = (blocks: T[]) => new Map(blocks.map((block) => [block.id, block]));
  const baseById = byId(base);
  const localById = byId(local);
  const serverById = byId(server);
  const sharedOrder = (blocks: T[], other: Map<string | undefined, T>) => blocks.flatMap(({ id }) => (other.has(id) ? [id] : []));
  if (sharedOrder(local, baseById).join('\n') !== sharedOrder(base, localById).join('\n')) return null;

  const merged = [...server];
  const indexOf = (id: string | undefined) => merged.findIndex((block) => block.id === id);
  for (const [id, before] of baseById) {
    const after = localById.get(id);
    if (sameBlock(after, before)) continue;
    const theirs = serverById.get(id);
    if (!sameBlock(theirs, before) && !sameBlock(theirs, after)) return null;
    const at = indexOf(id);
    if (at < 0) continue;
    if (after) merged[at] = after;
    else merged.splice(at, 1);
  }
  for (const [position, block] of local.entries()) {
    if (baseById.has(block.id)) continue;
    const theirs = serverById.get(block.id);
    if (theirs) {
      if (!sameBlock(theirs, block)) return null;
      continue;
    }
    const anchor = local
      .slice(0, position)
      .reverse()
      .find((earlier) => indexOf(earlier.id) >= 0);
    merged.splice(anchor ? indexOf(anchor.id) + 1 : 0, 0, block);
  }
  return merged;
}

/**
 * Carries the edits an offline document made on its seed into `target`, the server's document of another generation.
 * The two share no Yjs history: the edits go as blocks ({@link mergeBlocks}), in one transaction with no origin, a local
 * edit of `target`. `description` is the text the seed was built from.
 * @returns False when the edits conflict with what the server changed; `target` is untouched then.
 */
export function rebaseSeedEdits(description: string | null, local: Y.Doc, target: Y.Doc): boolean {
  const blocksOf = (doc: Y.Doc) => yDocToBlocks(editor(), doc, yjsFragmentName);
  const baseDoc = new Y.Doc();
  try {
    Y.applyUpdate(baseDoc, encodeSeed(parseDescription(description), 1));
    const server = blocksOf(target);
    const merged = mergeBlocks(blocksOf(baseDoc), blocksOf(local), server);
    if (!merged) return false;
    if (merged !== server) target.transact(() => blocksToYXmlFragment(editor(), merged, target.getXmlFragment(yjsFragmentName)));
    return true;
  } finally {
    baseDoc.destroy();
  }
}
