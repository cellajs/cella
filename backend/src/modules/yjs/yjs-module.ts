import { appConfig, type ProductEntityType } from 'shared';
import { type BackendModule, defineBackendModule } from '#/lib/module';
import type { MutationHandler } from '#/lib/mutation-bus';
import { yjsMaterializeWindow } from '#/modules/yjs/helpers/materialize-window';
import { assertMaterializeWindow } from '#/modules/yjs/operations/assert-materialize-window';
import { recordYjsOutsideWrite } from '#/modules/yjs/operations/record-outside-write';
import { retireYjsDocuments } from '#/modules/yjs/operations/retire-yjs-documents';
import { yjsHandlers } from '#/modules/yjs/yjs-handlers';
import { getYjsMaterializer } from '#/modules/yjs/yjs-materializers';
import type { EntityModel } from '#/tables';

type ProductRow = EntityModel<ProductEntityType>;

/**
 * True when the write itself wrote the row's description: the stx it stored names the fields it wrote (`buildStx`).
 * An op that reads `before` without locking the row may read it ahead of another write, so a description committed in
 * between differs from it although this write left the description alone. Comparing with it only screens out a set an
 * earlier write left in the stx, from an op that keeps the stored stx on a write that changes nothing
 * (updateAttachmentOp strips the set then).
 */
const wroteDescription = (row: ProductRow, before: ProductRow | undefined) =>
  row.stx.changedFields?.includes('description') === true && row.description !== before?.description;

/**
 * A description written by anything but the relay (a REST update, an MCP tool, an import) becomes an update of the
 * collaborative document of each row whose description the write wrote, in the writing transaction. The relay's own
 * write is the row of the materialize window's entity: it records nothing, and is refused (409) when its merge lacks
 * an outside write. Another row written inside the window (a sibling the materializer moves) is an outside write.
 * Only entity types with a materializer hold documents.
 */
const recordOnUpdate = (entityType: ProductEntityType): MutationHandler<`${ProductEntityType}.updated`> => {
  return async (ctx, { before = [], after = [] }) => {
    if (!getYjsMaterializer(entityType)) return;
    // The bus runs handlers in the write's transaction, after its UPDATE.
    await assertMaterializeWindow(ctx, { entityType, rows: after });
    const relayEntityId = yjsMaterializeWindow.getStore()?.entityId;
    const written = after.filter((row, index) => row.id !== relayEntityId && wroteDescription(row, before[index]));
    await recordYjsOutsideWrite(ctx, { entityType, rows: written });
  };
};

/** A deleted entity's document goes with it, and relays end its sessions at once. */
const retireOnDelete = (entityType: ProductEntityType): MutationHandler<`${ProductEntityType}.deleted`> => {
  return async (ctx, { before = [] }) => {
    if (!getYjsMaterializer(entityType)) return;
    await retireYjsDocuments(ctx, { entityType, entityIds: before.map(({ id }) => id) });
  };
};

const onMutation: NonNullable<BackendModule['onMutation']> = {};
for (const entityType of appConfig.productEntityTypes) {
  onMutation[`${entityType}.updated` as const] = recordOnUpdate(entityType);
  onMutation[`${entityType}.deleted` as const] = retireOnDelete(entityType);
}

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
