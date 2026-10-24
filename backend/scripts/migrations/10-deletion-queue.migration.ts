import { getTableName } from 'drizzle-orm';
import { storageColumnsOf } from '#/db/storage-columns';
import { entityTables } from '#/tables';
import type { SideEffectBlock, SideEffectProducer } from '../types';

/** One statement-level delete trigger per entity table, with its function; the verify block asserts both. */
export const deletionQueueTriggers = Object.entries(entityTables).map(([entityType, table]) => {
  const tableName = getTableName(table);
  return { entityType, tableName, triggerName: `${tableName}_queue_deleted_storage`, functionName: `queue_deleted_storage_${tableName}` };
});

/** The tenant and organization a deleted row of `entityType` belonged to, as columns of the transition table `gone`. */
const ownerColumns = (entityType: string): string => {
  if (entityType === 'user') return 'NULL, NULL';
  if (entityType === 'organization') return 'gone.tenant_id, gone.id';
  return 'gone.tenant_id, gone.organization_id';
};

/**
 * The trigger function for one table: copies each deleted row's id, owner and storage columns into `deleted_storage`.
 * Statement-level with a transition table, so a cascade or a purge of thousands of rows is one insert. Postgres runs a
 * referential action as a `DELETE` on the child table, so the trigger fires for FK cascades too.
 */
function generateTriggerSql({ entityType, tableName, triggerName, functionName }: (typeof deletionQueueTriggers)[number]): string {
  const columns = storageColumnsOf(tableName);
  const storage = columns.length > 0 ? `jsonb_build_object(${columns.map((column) => `'${column}', gone.${column}`).join(', ')})` : `'{}'::jsonb`;
  return `CREATE OR REPLACE FUNCTION public.${functionName}() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO public.deleted_storage (entity_type, entity_id, tenant_id, organization_id, storage)
  SELECT '${entityType}', gone.id, ${ownerColumns(entityType)}, ${storage} FROM gone;
  RETURN NULL;
END $fn$;
DROP TRIGGER IF EXISTS ${triggerName} ON public.${tableName};
CREATE TRIGGER ${triggerName} AFTER DELETE ON public.${tableName}
  REFERENCING OLD TABLE AS gone FOR EACH STATEMENT EXECUTE FUNCTION public.${functionName}();`;
}

async function run(): Promise<SideEffectBlock> {
  const migrationSql = `-- Deletion queue: every entity table records what a deleted row stored outside it
-- (files, collaborative documents) in deleted_storage, for the deleted-storage-cleanup job.
${deletionQueueTriggers.map(generateTriggerSql).join('\n\n')}
`;

  return {
    tag: 'deletion_queue',
    title: 'Delete triggers feeding deleted_storage',
    sql: migrationSql,
    notes: deletionQueueTriggers.map(({ tableName }) => `${tableName}: ${storageColumnsOf(tableName).join(', ') || 'id only'}`),
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Deletion queue',
  produce: run,
};
