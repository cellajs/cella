/**
 * Immutability triggers for identity columns.
 *
 * Prevents modification of identity columns (id, tenant_id, organization_id, etc.)
 * after row creation. Defense-in-depth: catches bugs even if someone bypasses RLS or
 * the guard chain.
 *
 * Uses BEFORE UPDATE plpgsql triggers that check `NEW.col IS DISTINCT FROM OLD.col`
 * and raise an exception. One shared function per column-set, one trigger per table.
 * Table configs are derived from appConfig, so new entity types are auto-protected.
 */

import { getTableName } from 'drizzle-orm';
import { appConfig, toColumnName } from 'shared';
import { entityTables } from '#/tables';

// ─── Immutable column sets ──────────────────────────────────────────────────

const BASE_ENTITY_COLUMNS = ['id', 'tenant_id', 'entity_type', 'created_at', 'created_by'] as const;
const MEMBERSHIP_CONTEXT_ID_COLUMNS = appConfig.contextEntityTypes.map((type) =>
  toColumnName(appConfig.entityIdColumnKeys[type]),
);
const BASE_MEMBERSHIP_COLUMNS = ['tenant_id', 'context_id', 'context_type', ...MEMBERSHIP_CONTEXT_ID_COLUMNS] as const;

/** Product entities with a parent org (tasks, labels, attachments) */
export const productEntityImmutableColumns = [...BASE_ENTITY_COLUMNS, 'organization_id'] as const;

/** Active memberships — includes user_id */
export const membershipImmutableColumns = [...BASE_MEMBERSHIP_COLUMNS, 'user_id'] as const;

/** Inactive memberships — user_id is mutable (re-assignable invitations) */
export const inactiveMembershipImmutableColumns = BASE_MEMBERSHIP_COLUMNS;

// ─── SQL builders ───────────────────────────────────────────────────────────

interface TableImmutabilityConfig {
  tableName: string;
  functionName: string;
}

/**
 * Generates a plpgsql function that raises an exception when any of the given
 * columns change. Uses `IS DISTINCT FROM` so NULL → value transitions are caught.
 */
function buildFunctionSQL(functionName: string, columns: readonly string[]): string {
  const guard = columns.map((col) => `NEW.${col} IS DISTINCT FROM OLD.${col}`).join('\n       OR ');

  return `
CREATE OR REPLACE FUNCTION ${functionName}() RETURNS TRIGGER AS $$
BEGIN
  IF ${guard} THEN
    RAISE EXCEPTION 'Cannot modify immutable columns (%) on %', '${columns.join(', ')}', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;`;
}

/** Attaches (or replaces) a BEFORE UPDATE trigger that calls `functionName`. */
function buildTriggerSQL(tableName: string, functionName: string): string {
  const triggerName = `${tableName}_immutable_keys_trigger`;
  return `
DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName};
CREATE TRIGGER ${triggerName}
  BEFORE UPDATE ON ${tableName}
  FOR EACH ROW EXECUTE FUNCTION ${functionName}();`;
}

// ─── Pre-built trigger functions ────────────────────────────────────────────

/** Shared by context entities (has tenant_id) */
export const baseEntityImmutabilityFunctionSQL = buildFunctionSQL('base_entity_immutable_keys', BASE_ENTITY_COLUMNS);

/** Product entities with parent — adds organization_id */
export const productEntityImmutabilityFunctionSQL = buildFunctionSQL(
  'product_entity_immutable_keys',
  productEntityImmutableColumns,
);

export const membershipImmutabilityFunctionSQL = buildFunctionSQL(
  'membership_immutable_keys',
  membershipImmutableColumns,
);

export const inactiveMembershipImmutabilityFunctionSQL = buildFunctionSQL(
  'inactive_membership_immutable_keys',
  inactiveMembershipImmutableColumns,
);

/** Blocks ALL updates — for audit/append-only tables */
export const appendOnlyImmutabilityFunctionSQL = `
CREATE OR REPLACE FUNCTION append_only_immutable_row() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only: updates are not allowed', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;`;

// ─── Table → function mapping (derived from appConfig) ──────────────────────

const contextEntityConfigs: TableImmutabilityConfig[] = appConfig.contextEntityTypes.map((t) => ({
  tableName: getTableName(entityTables[t]),
  functionName: 'base_entity_immutable_keys',
}));

const productWithParentConfigs: TableImmutabilityConfig[] = appConfig.productEntityTypes.map((t) => ({
  tableName: getTableName(entityTables[t]),
  functionName: 'product_entity_immutable_keys',
}));

const membershipConfigs: TableImmutabilityConfig[] = [
  { tableName: 'memberships', functionName: 'membership_immutable_keys' },
  { tableName: 'inactive_memberships', functionName: 'inactive_membership_immutable_keys' },
];

const appendOnlyConfigs: TableImmutabilityConfig[] = [
  { tableName: 'activities', functionName: 'append_only_immutable_row' },
];

/** Every table that has an immutability trigger */
export const allImmutabilityTables: TableImmutabilityConfig[] = [
  ...contextEntityConfigs,
  ...productWithParentConfigs,
  ...membershipConfigs,
  ...appendOnlyConfigs,
];

// ─── Combined SQL output ────────────────────────────────────────────────────

const baseEntityTables = contextEntityConfigs;
const names = (configs: TableImmutabilityConfig[]) => configs.map((c) => c.tableName).join(', ');

/**
 * Complete SQL to create all immutability functions + triggers.
 * Run after migrations to ensure protection is in place.
 */
export const immutabilityTriggersSQL = `
-- Functions (5)
-- Base entities: ${names(baseEntityTables)}
${baseEntityImmutabilityFunctionSQL}

-- Product entities with parent: ${names(productWithParentConfigs) || 'none'}
${productEntityImmutabilityFunctionSQL}

-- Memberships
${membershipImmutabilityFunctionSQL}

-- Inactive memberships
${inactiveMembershipImmutabilityFunctionSQL}

-- Append-only: ${names(appendOnlyConfigs)}
${appendOnlyImmutabilityFunctionSQL}

-- Triggers (${allImmutabilityTables.length} tables)
${allImmutabilityTables.map((t) => buildTriggerSQL(t.tableName, t.functionName)).join('\n')}
`;

// ─── Custom builders (for non-standard tables) ──────────────────────────────
