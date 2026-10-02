import type { DbContext } from '#/core/context';
import type { YjsDocScope, YjsDocumentRead } from '#/modules/yjs/helpers/yjs-log';
import { findEntityDescriptionForShare, findYjsDocument, insertYjsDocument } from '#/modules/yjs/yjs-queries';

// No `#/env` import and no pool: the Yjs relay imports this file, and passes its own transaction as `ctx.var.db`.

interface SeedYjsDocumentOpts {
  /** The document, with the organization its row carries. */
  doc: YjsDocScope;
  /** Converts the stored description into the seed: `descriptionToSeedOrEmpty`, with the caller's logging. */
  toSeed: (description: string | null) => Uint8Array;
}

/**
 * Seeds the document from its entity, for the relay's first handshake and the API's first pull, in the caller's
 * transaction: the description read FOR SHARE, converted by `toSeed`, the document row inserted under a new generation
 * unless one exists, and the document read back. An outside write of the description either commits first and is
 * seeded, or waits for the seed and then finds the document row, into which it appends its update: no write falls
 * between the read and the insert. Concurrent seeds converge on the first. Null, with nothing inserted, when the
 * entity has no live row: it was deleted, and its document must not come back. Runs under the document's tenant
 * context, as `findYjsDocument` does.
 */
export async function seedYjsDocument(ctx: DbContext, { doc, toSeed }: SeedYjsDocumentOpts): Promise<YjsDocumentRead | null> {
  const entity = await findEntityDescriptionForShare(ctx, { doc });
  if (!entity) return null;
  await insertYjsDocument(ctx, { doc, state: toSeed(entity.description) });
  return findYjsDocument(ctx, { doc });
}
