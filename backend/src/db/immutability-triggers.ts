/**
 * Immutability triggers for identity columns.
 *
 * These triggers prevent modification of identity columns (id, tenant_id, organization_id, etc.)
 * after row creation. They provide defense-in-depth protection against accidental or malicious
 * column modifications, even if someone uses admin bypass or adds a sloppy RLS policy.
 *
 */

import { getTableName } from 'drizzle-orm';
import { appConfig } from 'shared';
import { entityTables } from '#/table-config';

// ============================================================================
// Immutable Column Sets by Entity Category
// ============================================================================

/** Base immutable columns shared by all entity types */
const baseEntityImmutableColumns = ['id', 'tenant_id', 'entity_type', 'created_at', 'created_by'] as const;

/** Base immutable columns for membership tables */
const baseMembershipImmutableColumns = ['tenant_id', 'organization_id'] as const;

/** Context entities (e.g., organizations) - use base columns */
export const contextEntityImmutableColumns = baseEntityImmutableColumns;

/** Product entities with parent (e.g., attachments) - base + organization_id */
export const productEntityImmutableColumns = [...baseEntityImmutableColumns, 'organization_id'] as const;

/** Parentless product entities (e.g., pages) - same as context (no organization_id) */
export const parentlessProductEntityImmutableColumns = baseEntityImmutableColumns;

/** Memberships - base membership + user_id */
export const membershipImmutableColumns = [...baseMembershipImmutableColumns, 'user_id'] as const;

/** Inactive memberships - base membership columns only */
export const inactiveMembershipImmutableColumns = baseMembershipImmutableColumns;

// ============================================================================
// Generic Trigger SQL Builders
// ============================================================================

/**
 * Build SQL for a generic immutability trigger function.
 * The function checks if any of the specified columns changed and raises an exception if so.
 */
function buildImmutabilityFunctionSQL(functionName: string, columns: readonly string[]): string {
  const conditions = columns.map((col) => `NEW.${col} IS DISTINCT FROM OLD.${col}`).join('\n       OR ');
  const columnList = columns.join(', ');

  return `
CREATE OR REPLACE FUNCTION ${functionName}() RETURNS TRIGGER AS $$
BEGIN
  IF ${conditions} THEN
    RAISE EXCEPTION 'Cannot modify immutable columns (%) on %', '${columnList}', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;`;
}

/**
 * Build SQL to create/replace immutability trigger on a table.
 */
function buildImmutabilityTriggerSQL(tableName: string, functionName: string): string {
  const triggerName = `${tableName}_immutable_keys_trigger`;
  return `
DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName};
CREATE TRIGGER ${triggerName}
  BEFORE UPDATE ON ${tableName}
  FOR EACH ROW EXECUTE FUNCTION ${functionName}();`;
}

// ============================================================================
// Pre-built Functions for Each Entity Category
// ============================================================================

/**
 * Immutability function for base entity types (context entities + parentless products).
 * Both share the same columns: id, tenant_id, entity_type, created_at, created_by.
 */
export const baseEntityImmutabilityFunctionSQL = buildImmutabilityFunctionSQL(
  'base_entity_immutable_keys',
  baseEntityImmutableColumns,
);

/** Immutability function for product entities with parent (attachments, etc.) - adds organization_id */
export const productEntityImmutabilityFunctionSQL = buildImmutabilityFunctionSQL(
  'product_entity_immutable_keys',
  productEntityImmutableColumns,
);

/** Immutability function for memberships */
export const membershipImmutabilityFunctionSQL = buildImmutabilityFunctionSQL(
  'membership_immutable_keys',
  membershipImmutableColumns,
);

/** Immutability function for inactive memberships */
export const inactiveMembershipImmutabilityFunctionSQL = buildImmutabilityFunctionSQL(
  'inactive_membership_immutable_keys',
  inactiveMembershipImmutableColumns,
);

/** Immutability function for append-only tables (e.g., activities) - blocks ALL updates */
export const appendOnlyImmutabilityFunctionSQL = `
CREATE OR REPLACE FUNCTION append_only_immutable_row() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only: updates are not allowed', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;`;

// ============================================================================
// Table Configuration - Derived from appConfig
// ============================================================================

/** Configuration for applying immutability triggers to tables */
interface TableImmutabilityConfig {
  tableName: string;
  functionName: string;
}

/** Parentless product types (from hierarchy config) */
const parentlessProductTypes = new Set<string>(appConfig.parentlessProductEntityTypes);

/** Context entity tables - use base_entity function */
const contextEntityTableConfigs: TableImmutabilityConfig[] = appConfig.contextEntityTypes.map((entityType) => ({
  tableName: getTableName(entityTables[entityType]),
  functionName: 'base_entity_immutable_keys',
}));

/** Parentless product entity tables - also use base_entity function (same columns) */
const parentlessProductEntityTableConfigs: TableImmutabilityConfig[] = appConfig.parentlessProductEntityTypes.map(
  (entityType) => ({
    tableName: getTableName(entityTables[entityType]),
    functionName: 'base_entity_immutable_keys',
  }),
);

/** Product entity tables with parent (have organization_id) */
const productEntityTableConfigs: TableImmutabilityConfig[] = appConfig.productEntityTypes
  .filter((entityType) => !parentlessProductTypes.has(entityType))
  .map((entityType) => ({
    tableName: getTableName(entityTables[entityType]),
    functionName: 'product_entity_immutable_keys',
  }));

/** Membership tables - these are fixed (not entity types) */
const membershipTableConfigs: TableImmutabilityConfig[] = [
  { tableName: 'memberships', functionName: 'membership_immutable_keys' },
  { tableName: 'inactive_memberships', functionName: 'inactive_membership_immutable_keys' },
];

/** Append-only tables - block all updates */
const appendOnlyTableConfigs: TableImmutabilityConfig[] = [
  { tableName: 'activities', functionName: 'append_only_immutable_row' },
];

/** All tables with immutability triggers */
export const allImmutabilityTables = [
  ...contextEntityTableConfigs,
  ...parentlessProductEntityTableConfigs,
  ...productEntityTableConfigs,
  ...membershipTableConfigs,
  ...appendOnlyTableConfigs,
];

// ============================================================================
// Combined SQL for All Triggers
// ============================================================================

/** Tables using base entity function (context + parentless products) */
const baseEntityTables = [...contextEntityTableConfigs, ...parentlessProductEntityTableConfigs];

/** Tables using product entity function (with organization_id) */
const productWithParentTables = productEntityTableConfigs;

/**
 * Complete SQL to create all immutability functions and triggers.
 * Run this after migrations to ensure protection is in place.
 */
export const immutabilityTriggersSQL = `
-- ==========================================================================
-- Immutability Trigger Functions (${3 + membershipTableConfigs.length} functions)
-- ==========================================================================

-- Base entities: context + parentless products (${baseEntityTables.map((t) => t.tableName).join(', ')})
${baseEntityImmutabilityFunctionSQL}

-- Product entities with parent (${productWithParentTables.map((t) => t.tableName).join(', ') || 'none'})
${productEntityImmutabilityFunctionSQL}

-- Memberships
${membershipImmutabilityFunctionSQL}

-- Inactive memberships
${inactiveMembershipImmutabilityFunctionSQL}

-- Append-only tables (${appendOnlyTableConfigs.map((t) => t.tableName).join(', ')})
${appendOnlyImmutabilityFunctionSQL}

-- ==========================================================================
-- Apply Triggers to Tables (${allImmutabilityTables.length} tables)
-- ==========================================================================

${allImmutabilityTables.map((t) => buildImmutabilityTriggerSQL(t.tableName, t.functionName)).join('\n')}
`;

// ============================================================================
// Custom Trigger Builders (for non-standard tables)
// ============================================================================

/**
 * Create a custom immutability function for tables with non-standard columns.
 * Returns the function SQL - you must execute it separately.
 */
export function buildCustomImmutabilityFunction(functionName: string, columns: string[]): string {
  return buildImmutabilityFunctionSQL(functionName, columns);
}

/**
 * Build trigger SQL for a custom table/function combination.
 */
export function buildCustomImmutabilityTrigger(tableName: string, functionName: string): string {
  return buildImmutabilityTriggerSQL(tableName, functionName);
}
