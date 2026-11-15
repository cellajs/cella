import { getTableName } from 'drizzle-orm';
import { appConfig } from 'shared';
import { channelCodeLength } from 'shared/share-link';
import { channelCodesTable } from '#/modules/links/links-db';
import { entityTables } from '#/tables';
import type { SideEffectBlock, SideEffectProducer } from '../types';

export const nextChannelCodeFunctionName = 'next_channel_code';
export const assignChannelCodeFunctionName = 'assign_channel_code';
export const channelCodeTriggerName = (tableName: string) => `${tableName}_code_trigger`;

/**
 * Gives every channel row a share code at insert, drawn from `channel_codes`, and refuses to change it after. A copied
 * row (a demo, an import) never shares a code: the insert ignores the one the row brings. Rows from before the column
 * existed take theirs in the backfill, the one update allowed to set it.
 */
function run(): SideEffectBlock {
  const registry = getTableName(channelCodesTable);
  const tables = appConfig.channelEntityTypes.map((type) => getTableName(entityTables[type as keyof typeof entityTables]));

  const perTable = tables
    .map(
      (name) => `DROP TRIGGER IF EXISTS ${channelCodeTriggerName(name)} ON ${name};
--> statement-breakpoint
CREATE TRIGGER ${channelCodeTriggerName(name)} BEFORE INSERT OR UPDATE OF code ON ${name} FOR EACH ROW EXECUTE FUNCTION ${assignChannelCodeFunctionName}();
--> statement-breakpoint
UPDATE ${name} SET code = ${nextChannelCodeFunctionName}(tenant_id, entity_type, id) WHERE code = '';`,
    )
    .join('\n--> statement-breakpoint\n');

  // A v4 uuid's bytes 9 to 15 are all random; the modulo leaves a bias too small to help a guess.
  const migrationSql = `-- Channel codes: the code of a channel, drawn once from the registry
CREATE OR REPLACE FUNCTION ${nextChannelCodeFunctionName}(p_tenant_id varchar, p_channel_type varchar, p_channel_id uuid) RETURNS varchar LANGUAGE plpgsql AS $$
DECLARE
  alphabet constant text := '0123456789abcdefghijklmnopqrstuvwxyz';
  bytes bytea;
  candidate varchar;
BEGIN
  SELECT code INTO candidate FROM ${registry} WHERE channel_id = p_channel_id;
  IF candidate IS NOT NULL THEN
    RETURN candidate;
  END IF;
  LOOP
    bytes := uuid_send(gen_random_uuid());
    candidate := substr(alphabet, get_byte(bytes, 9) % 10 + 1, 1);
    FOR i IN 10..${9 + channelCodeLength - 1} LOOP
      candidate := candidate || substr(alphabet, get_byte(bytes, i) % 36 + 1, 1);
    END LOOP;
    INSERT INTO ${registry} (code, tenant_id, channel_type, channel_id) VALUES (candidate, p_tenant_id, p_channel_type, p_channel_id)
    ON CONFLICT (code) DO NOTHING;
    IF FOUND THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ${assignChannelCodeFunctionName}() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.code IS DISTINCT FROM OLD.code AND OLD.code <> '' THEN
      RAISE EXCEPTION 'Cannot modify code on %', TG_TABLE_NAME;
    END IF;
    RETURN NEW;
  END IF;
  NEW.code := ${nextChannelCodeFunctionName}(NEW.tenant_id, NEW.entity_type, NEW.id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
${perTable}`;

  return {
    tag: 'channel_codes',
    title: 'Channel codes, assign_channel_code trigger per channel table',
    sql: migrationSql,
    notes: [`Channel tables (${tables.length}): ${tables.join(', ')}`],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Channel codes',
  produce: run,
};
