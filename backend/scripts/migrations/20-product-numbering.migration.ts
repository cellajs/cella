import { getTableName } from 'drizzle-orm';
import { hierarchy } from 'shared';
import { numberedProductTypes } from 'shared/numbered-products';
import { hasPublishedAt } from '#/db/utils/published-predicate';
import { productNumberingTable, productNumberMovesTable } from '#/modules/numbering/numbering-db';
import { getEntityTable } from '#/tables';
import type { SideEffectBlock, SideEffectProducer } from '../types';

export const assignNumberFunctionName = 'assign_product_number';
export const numberTriggerName = (tableName: string) => `${tableName}_number_trigger`;

/**
 * Numbers the rows of each numbered product type per home channel, the deepest channel the row sits in. A row inserted
 * at 0, which is what the client placeholder and every insert path send, takes the next value of its channel's counter
 * row; the upsert's row lock serializes concurrent inserts into one channel, and each table's unique index is the
 * backstop. A number above 0 passes through on insert: a backfill or an import can bring its own.
 *
 * An update keeps the number, with two exceptions. A table with drafts passes `drafts` to the trigger: a draft is
 * inserted at 0 and takes its number in the update that publishes it. And a numbered row that moves to another channel
 * leaves its number in `product_number_moves`, where the old link reads that it moved. It takes the number it had in
 * the target channel before, or the next one. Numbers left behind are never handed out again.
 *
 * A newly numbered table's rows at 0 are numbered once, oldest first, before its trigger exists, which would refuse that update.
 */
function run(): SideEffectBlock {
  const counter = getTableName(productNumberingTable);
  const moves = getTableName(productNumberMovesTable);
  const tables = numberedProductTypes.map((type) => {
    const table = getEntityTable(type);
    if (!('number' in table)) throw new Error(`Numbered product type ${type} has no number column: add numberColumn to its table`);
    const home = (row: string) => {
      const sql = hierarchy.deepestAncestorSql(type, row);
      if (!sql) throw new Error(`Numbered product type ${type} has no channel ancestor`);
      return sql;
    };
    return { type, name: getTableName(table), drafts: hasPublishedAt(table), home };
  });

  // Each table reads its own ancestor columns: a branch is planned only when it runs, so the others never resolve.
  const homeBranches = tables
    .map(
      ({ name, home }, i) => `  ${i === 0 ? 'IF' : 'ELSIF'} TG_TABLE_NAME = '${name}' THEN
    home := ${home('NEW')};
    IF TG_OP = 'UPDATE' THEN
      old_home := ${home('OLD')};
    END IF;`,
    )
    .join('\n');

  const triggers = tables
    .map(
      ({ type, name, drafts, home }) => `DROP TRIGGER IF EXISTS ${numberTriggerName(name)} ON ${name};
--> statement-breakpoint
WITH numbered AS (
  SELECT r.id, ${home('r')} AS home,
    row_number() OVER (PARTITION BY ${home('r')} ORDER BY r.created_at, r.id) AS rank
  FROM ${name} r
  WHERE r.number = 0${drafts ? ' AND r.published_at IS NOT NULL' : ''}
)
UPDATE ${name} SET number = coalesce(counter.last_number, 0) + numbered.rank
FROM numbered
LEFT JOIN ${counter} counter ON counter.channel_id = numbered.home AND counter.product_type = '${type}'
WHERE ${name}.id = numbered.id;
--> statement-breakpoint
INSERT INTO ${counter} (tenant_id, organization_id, channel_id, product_type, last_number)
SELECT r.tenant_id, r.organization_id, ${home('r')}, r.entity_type, max(r.number)
FROM ${name} r
WHERE r.number > 0
GROUP BY 1, 2, 3, 4
ON CONFLICT (channel_id, product_type) DO UPDATE SET last_number = greatest(${counter}.last_number, excluded.last_number);
--> statement-breakpoint
CREATE TRIGGER ${numberTriggerName(name)} BEFORE INSERT OR UPDATE ON ${name} FOR EACH ROW EXECUTE FUNCTION ${assignNumberFunctionName}(${drafts ? "'drafts'" : ''});`,
    )
    .join('\n--> statement-breakpoint\n');

  const migrationSql = `-- Product numbering: the next number in the row's home channel for a row inserted at 0, a draft as it publishes, or a row that moved
CREATE OR REPLACE FUNCTION ${assignNumberFunctionName}() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  draft boolean := false;
  publishing boolean := false;
  home uuid;
  old_home uuid;
  reclaimed integer;
BEGIN
${homeBranches}
  ELSE
    RAISE EXCEPTION '% is not a numbered table', TG_TABLE_NAME;
  END IF;
  -- Nested, so a table without drafts never reads published_at
  IF TG_NARGS > 0 AND TG_ARGV[0] = 'drafts' THEN
    draft := NEW.published_at IS NULL;
    IF TG_OP = 'UPDATE' THEN
      publishing := OLD.published_at IS NULL AND NOT draft AND coalesce(NEW.number, 0) = 0;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NOT publishing THEN
    IF NEW.number IS DISTINCT FROM OLD.number THEN
      RAISE EXCEPTION 'Cannot modify number on %', TG_TABLE_NAME;
    END IF;
    IF OLD.number = 0 OR home IS NOT DISTINCT FROM old_home THEN
      RETURN NEW;
    END IF;
    INSERT INTO ${moves} (tenant_id, organization_id, channel_id, product_type, number, entity_id)
    VALUES (OLD.tenant_id, OLD.organization_id, old_home, OLD.entity_type, OLD.number, OLD.id)
    ON CONFLICT (channel_id, product_type, number) DO NOTHING;
    DELETE FROM ${moves} WHERE channel_id = home AND product_type = NEW.entity_type AND entity_id = NEW.id
    RETURNING number INTO reclaimed;
    IF reclaimed IS NOT NULL THEN
      NEW.number := reclaimed;
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'INSERT' AND (draft OR coalesce(NEW.number, 0) > 0) THEN
    RETURN NEW;
  END IF;
  INSERT INTO ${counter} (tenant_id, organization_id, channel_id, product_type, last_number)
  VALUES (NEW.tenant_id, NEW.organization_id, home, NEW.entity_type, 1)
  ON CONFLICT (channel_id, product_type)
  DO UPDATE SET last_number = ${counter}.last_number + 1
  RETURNING last_number INTO NEW.number;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
${triggers}`;

  return {
    tag: 'product_numbering',
    title: 'Product numbering, assign_product_number trigger per numbered table',
    sql: migrationSql,
    notes: [`Numbered tables (${tables.length}): ${tables.map(({ name, drafts }) => (drafts ? `${name} (drafts)` : name)).join(', ')}`],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Product numbering',
  produce: run,
};
