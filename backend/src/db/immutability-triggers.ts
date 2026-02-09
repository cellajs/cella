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

/** Columns that should never change after creation for context entities (e.g., organizations) */
export const contextEntityImmutableColumns = ['id', 'tenant_id', 'entity_type', 'created_at', 'created_by'] as const;

/** Columns that should never change after creation for product entities (e.g., pages, attachments) */
export const productEntityImmutableColumns = [
  'id',
  'tenant_id',
  'organization_id',
  'entity_type',
  'created_at',
  'created_by',
] as const;

/** Columns that should never change after creation for memberships */
export const membershipImmutableColumns = ['tenant_id', 'organization_id', 'user_id'] as const;

/** Columns that should never change after creation for inactive memberships */
export const inactiveMembershipImmutableColumns = ['tenant_id', 'organization_id'] as const;

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

/** Immutability function for context entities (organizations, etc.) */
export const contextEntityImmutabilityFunctionSQL = buildImmutabilityFunctionSQL(
  'context_entity_immutable_keys',
  contextEntityImmutableColumns,
);

/** Immutability function for product entities (pages, attachments, etc.) */
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

// ============================================================================
// Table Configuration - Derived from appConfig
// ============================================================================

/** Configuration for applying immutability triggers to tables */
interface TableImmutabilityConfig {
  tableName: string;
  functionName: string;
}

/** Context entity tables - derived from appConfig.contextEntityTypes */
const contextEntityTableConfigs: TableImmutabilityConfig[] = appConfig.contextEntityTypes.map((entityType) => ({
  tableName: getTableName(entityTables[entityType]),
  functionName: 'context_entity_immutable_keys',
}));

/** Product entity tables - derived from appConfig.productEntityTypes */
const productEntityTableConfigs: TableImmutabilityConfig[] = appConfig.productEntityTypes.map((entityType) => ({
  tableName: getTableName(entityTables[entityType]),
  functionName: 'product_entity_immutable_keys',
}));

/** Membership tables - these are fixed (not entity types) */
const membershipTableConfigs: TableImmutabilityConfig[] = [
  { tableName: 'memberships', functionName: 'membership_immutable_keys' },
  { tableName: 'inactive_memberships', functionName: 'inactive_membership_immutable_keys' },
];

/** All tables with immutability triggers */
export const allImmutabilityTables = [
  ...contextEntityTableConfigs,
  ...productEntityTableConfigs,
  ...membershipTableConfigs,
];

// ============================================================================
// Combined SQL for All Triggers
// ============================================================================

/**
 * Complete SQL to create all immutability functions and triggers.
 * Run this after migrations to ensure protection is in place.
 */
export const immutabilityTriggersSQL = `
-- ==========================================================================
-- Immutability Trigger Functions
-- ==========================================================================

-- Context entities (${appConfig.contextEntityTypes.join(', ')})
${contextEntityImmutabilityFunctionSQL}

-- Product entities (${appConfig.productEntityTypes.join(', ')})
${productEntityImmutabilityFunctionSQL}

-- Memberships
${membershipImmutabilityFunctionSQL}

-- Inactive memberships
${inactiveMembershipImmutabilityFunctionSQL}

-- ==========================================================================
-- Apply Triggers to Tables
-- ==========================================================================

-- Context entity tables
${contextEntityTableConfigs.map((t) => buildImmutabilityTriggerSQL(t.tableName, t.functionName)).join('\n')}

-- Product entity tables
${productEntityTableConfigs.map((t) => buildImmutabilityTriggerSQL(t.tableName, t.functionName)).join('\n')}

-- Membership tables
${membershipTableConfigs.map((t) => buildImmutabilityTriggerSQL(t.tableName, t.functionName)).join('\n')}
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
