import { appConfig, type ProductEntityType, type TrackedEventType } from 'shared';
import type { Tx } from '#/db/create-connection';
import { defineBackendModule } from '#/lib/module';
import type { MutationHandler, MutationPayload } from '#/lib/mutation-bus';
import { assertMaterializeWindow } from './helpers/materialize-window';
import { recordYjsOutsideWrite, type YjsWrittenRow } from './helpers/record-outside-write';
import { yjsHandlers } from './yjs-handlers';
import { retireYjsDocuments } from './yjs-log';
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
 * A description written by anything but the relay (a REST update, an MCP tool, an import) becomes an update of the
 * collaborative document of each row whose description changed, in the writing transaction. The relay's own
 * materialization carries `materialized` and records nothing: it is refused (409) when its merge lacks an outside
 * write. Only entity types with a materializer hold documents.
 */
const recordOnUpdate = (entityType: ProductEntityType): MutationHandler => {
  return async (ctx, { before = [], after = [], materialized }) => {
    if (!getYjsMaterializer(entityType)) return;
    // The bus runs handlers in the write's transaction, after its UPDATE.
    const tx = ctx.var.db as Tx;
    if (materialized) return assertMaterializeWindow(tx, entityType, after);
    const changed = after.filter((row, index) => row.description !== before[index]?.description);
    await recordYjsOutsideWrite(
      tx,
      entityType,
      changed.flatMap((row) => writtenRowOf(row) ?? []),
    );
  };
};

/** A deleted entity's document goes with it, and relays end its sessions at once. */
const retireOnDelete = (entityType: ProductEntityType): MutationHandler => {
  return async (ctx, { before = [] }) => {
    if (!getYjsMaterializer(entityType)) return;
    await retireYjsDocuments(ctx.var.db, entityType, idsOf(before));
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
    worker. The relay's materialize route, which writes a compacted collaborative document to its entity, is served
    on the internal listener only.`,
  routes: [{ path: '/:tenantId/:organizationId/yjs', app: yjsHandlers, phase: 'tenant' }],
  onMutation,
});
