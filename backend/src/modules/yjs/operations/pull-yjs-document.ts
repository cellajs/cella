import type { ProductEntityType } from 'shared';
import * as Y from 'yjs';
import type { OrgContext } from '#/core/context';
import { AppError } from '#/core/error';
import { tenantContext } from '#/db/tenant-context';
import { mergeLog } from '#/modules/yjs/helpers/yjs-state';
import { authorizeYjsEditor } from '#/modules/yjs/operations/authorize-yjs-editor';
import { seedYjsDocument } from '#/modules/yjs/operations/seed-yjs-document';
import { findYjsDocument } from '#/modules/yjs/yjs-queries';
import { log } from '#/utils/logger';

/** The update of a document that holds nothing. */
const emptyUpdate = Y.encodeStateAsUpdate(new Y.Doc());

/** True when Yjs decodes `bytes` as a state vector. */
function isStateVector(bytes: Uint8Array): boolean {
  try {
    Y.decodeStateVector(bytes);
    return true;
  } catch {
    return false;
  }
}

export interface PullYjsDocumentOpts {
  entityType: ProductEntityType;
  entityId: string;
  /** The caller's state vector: the answer carries what it lacks. */
  stateVector: Uint8Array;
}

export interface PulledYjsDocument {
  generation: string;
  /** What the caller's state vector lacks, as one update: every struct it misses, and the whole delete set. */
  update: Uint8Array;
  /** The server's state vector, so the caller can post what the server lacks. */
  stateVector: Uint8Array;
}

/**
 * Answers a client that cannot reach the relay with what its copy of the document lacks, as the relay answers a
 * handshake's Step1: base and log read as one (`findYjsDocument`), merged, and diffed against the caller's state
 * vector. A document never opened is seeded first, in the same transaction, as the relay's first handshake seeds it
 * (`seedYjsDocument`), so every document is editable while the relay is down. Appends nothing and stamps nothing:
 * the relay's sweep still sees a document edited over HTTP alone as one no session holds.
 * @param ctx - A user acting in a resolved organization.
 * @param opts - The document and the caller's state vector.
 * @returns The generation, the diff and the server's state vector.
 * @throws AppError 403 or 404 as `authorizeYjsEditor`; 404 when the entity was deleted before the seed; 400 for a
 * state vector Yjs cannot decode.
 */
export async function pullYjsDocumentOp(ctx: OrgContext, { entityType, entityId, stateVector }: PullYjsDocumentOpts): Promise<PulledYjsDocument> {
  const doc = await authorizeYjsEditor(ctx, { entityType, entityId });
  if (!isStateVector(stateVector)) {
    throw new AppError(400, 'invalid_request', 'warn', { entityType, meta: { reason: 'The state vector does not decode' } });
  }

  const document = await tenantContext(ctx, async (txCtx) => {
    const found = await findYjsDocument(txCtx, { doc });
    if (found) return found;
    // BlockNote loads on the first seed only.
    const { descriptionToSeedOrEmpty } = await import('#/modules/yjs/helpers/description-update');
    const toSeed = (description: string | null) =>
      descriptionToSeedOrEmpty(description, (err) =>
        log.warn('The description does not convert: seeding an empty document', { entityType, entityId: doc.entityId, err }),
      );
    return seedYjsDocument(txCtx, { doc, toSeed });
  });
  // Deleted between the authorization and the seed: a deleted entity's document must not come back.
  if (!document) throw new AppError(404, 'not_found', 'warn', { entityType });

  const state = mergeLog(document.base, document.rows).state ?? emptyUpdate;
  return { generation: document.generation, update: Y.diffUpdate(state, stateVector), stateVector: Y.encodeStateVectorFromUpdate(state) };
}
