import { appConfig, type ProductEntityType, type TrackedEventType } from 'shared';
import { defineBackendModule } from '#/lib/module';
import type { MutationHandler, MutationPayload } from '#/lib/mutation-bus';
import { retireYjsDocuments } from './operations/retire-yjs-documents';
import { yjsHandlers } from './yjs-handlers';
import { getYjsMaterializer } from './yjs-materializers';

const idsOf = (rows: MutationPayload['before'] = []) =>
  rows.flatMap((row) => (typeof row.id === 'string' ? [row.id] : []));

/**
 * A description written by anything but the relay (a REST update, an import) retires the collaborative document of
 * each row whose description changed: the relay's own materialization carries `serverOrigin`. A deleted entity's
 * document goes with it. Only entity types with a materializer hold documents.
 */
const retireOnMutation = (entityType: ProductEntityType): MutationHandler => {
  return async (ctx, { before = [], after, serverOrigin }) => {
    if (serverOrigin || !getYjsMaterializer(entityType)) return;
    const rows = after ? after.filter((row, index) => row.description !== before[index]?.description) : before;
    await retireYjsDocuments(ctx.var.db, entityType, idsOf(rows));
  };
};

const onMutation: Partial<Record<TrackedEventType, MutationHandler>> = Object.fromEntries(
  appConfig.productEntityTypes.flatMap((entityType) => [
    [`${entityType}.updated`, retireOnMutation(entityType)],
    [`${entityType}.deleted`, retireOnMutation(entityType)],
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
