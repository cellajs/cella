import { appConfig, type ProductEntityType } from 'shared';
import { type BackendModule, defineBackendModule } from '#/lib/module';
import type { MutationHandler } from '#/lib/mutation-bus';
import { yjsMaterializeWindow } from '#/modules/yjs/helpers/materialize-window';
import { assertMaterializeWindow } from '#/modules/yjs/operations/assert-materialize-window';
import { recordYjsOutsideWrite } from '#/modules/yjs/operations/record-outside-write';
import { retireYjsDocuments } from '#/modules/yjs/operations/retire-yjs-documents';
import { yjsHandlers } from '#/modules/yjs/yjs-handlers';
import { getYjsMaterializer } from '#/modules/yjs/yjs-materializers';

/**
 * A description written by anything but the relay (a REST update, an MCP tool, an import) becomes an update of the
 * collaborative document of each row whose description the write wrote, in the writing transaction. The relay's own
 * write is the row of the materialize window's entity: it records nothing, and is refused (409) when its merge lacks
 * an outside write. Another row written inside the window (a sibling the materializer moves) is an outside write.
 * Only entity types with a materializer hold documents.
 */
const recordOnUpdate =
  (entityType: ProductEntityType): MutationHandler<`${ProductEntityType}.updated`> =>
  async (ctx, { after = [], changedFields = [] }) => {
    if (!getYjsMaterializer(entityType)) return;
    // The bus runs handlers in the write's transaction, after its UPDATE.
    await assertMaterializeWindow(ctx, { entityType, rows: after });
    const relayEntityId = yjsMaterializeWindow.getStore()?.entityId;
    // The write's own field list says whether it wrote the description.
    const written = after.filter((row, index) => row.id !== relayEntityId && changedFields[index]?.includes('description'));
    await recordYjsOutsideWrite(ctx, { entityType, rows: written });
  };

/** A deleted entity's document goes with it, and relays end its sessions at once. */
const retireOnDelete =
  (entityType: ProductEntityType): MutationHandler<`${ProductEntityType}.deleted`> =>
  async (ctx, { before = [] }) => {
    if (!getYjsMaterializer(entityType)) return;
    await retireYjsDocuments(ctx, { entityType, entityIds: before.map(({ id }) => id) });
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
  routes: [{ path: '/tenants/:tenantId/organizations/:organizationId/yjs', app: yjsHandlers }],
  onMutation,
});
