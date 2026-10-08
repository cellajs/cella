import { appConfig, type ProductEntityType, type TrackedEventType } from 'shared';
import { defineBackendModule } from '#/lib/module';
import type { MutationHandler, MutationPayload } from '#/lib/mutation-bus';
import { assertMaterializeWindow } from './operations/assert-materialize-window';
import { recordYjsOutsideWrite, type YjsWrittenRow } from './operations/record-outside-write';
import { retireYjsDocuments } from './operations/retire-yjs-documents';
import { yjsHandlers } from './yjs-handlers';
import { getYjsMaterializer } from './yjs-materializers';

type PayloadRow = NonNullable<MutationPayload['before']>[number];

const idsOf = (rows: PayloadRow[] = []) => rows.flatMap((row) => (typeof row.id === 'string' ? [row.id] : []));

/** The keys and description of a written entity row; null for a row that lacks them. */
const writtenRowOf = ({ id, tenantId, organizationId, description }: PayloadRow): YjsWrittenRow | null => {
  if (typeof id !== 'string' || typeof tenantId !== 'string') return null;
  if (description !== null && typeof description !== 'string') return null;
  return { id, tenantId, organizationId: typeof organizationId === 'string' ? organizationId : null, description };
};

/**
 * True when the write itself wrote the row's description: the stx it stored names the fields it wrote (`buildStx`).
 * An op that reads `before` without locking the row may read it ahead of another write, so a description committed in
 * between differs from it although this write left the description alone. Comparing with it only screens out a set an
 * earlier write left in the stx, from an op that keeps the stored stx on a write that changes nothing
 * (updateAttachmentOp strips the set then).
 */
const wroteDescription = (row: PayloadRow, before: PayloadRow | undefined) => {
  const changedFields = (row.stx as { changedFields?: unknown } | null | undefined)?.changedFields;
  return Array.isArray(changedFields) && changedFields.includes('description') && row.description !== before?.description;
};

/**
 * A description written by anything but the relay (a REST update, an MCP tool, an import) becomes an update of the
 * collaborative document of each row whose description the write wrote, in the writing transaction. The relay's own
 * materialization carries `materialized` and records nothing: it is refused (409) when its merge lacks an outside
 * write. Only entity types with a materializer hold documents.
 */
const recordOnUpdate = (entityType: ProductEntityType): MutationHandler => {
  return async (ctx, { before = [], after = [], materialized }) => {
    if (!getYjsMaterializer(entityType)) return;
    // The bus runs handlers in the write's transaction, after its UPDATE.
    if (materialized) return assertMaterializeWindow(ctx, { entityType, rows: after });
    const written = after.filter((row, index) => wroteDescription(row, before[index]));
    await recordYjsOutsideWrite(ctx, { entityType, rows: written.flatMap((row) => writtenRowOf(row) ?? []) });
  };
};

/** A deleted entity's document goes with it, and relays end its sessions at once. */
const retireOnDelete = (entityType: ProductEntityType): MutationHandler => {
  return async (ctx, { before = [] }) => {
    if (!getYjsMaterializer(entityType)) return;
    await retireYjsDocuments(ctx, { entityType, entityIds: idsOf(before) });
  };
};

const onMutation: Partial<Record<TrackedEventType, MutationHandler>> = Object.fromEntries(
  appConfig.productEntityTypes.flatMap((entityType) => [
    [`${entityType}.updated`, recordOnUpdate(entityType)],
    [`${entityType}.deleted`, retireOnDelete(entityType)],
  ]),
);

defineBackendModule({
  name: 'yjs',
  owner: 'cella',
  scope: ['backend'],
  description: `Endpoints for Yjs collaborative editing support: a short-lived token per entity for the Yjs relay
    worker, and pull and push routes that sync a document through the API while the relay is out of reach. The relay's
    materialize route, which writes a compacted collaborative document to its entity, is served on the internal
    listener only.`,
  routes: [{ path: '/:tenantId/:organizationId/yjs', app: yjsHandlers, phase: 'tenant' }],
  onMutation,
});
