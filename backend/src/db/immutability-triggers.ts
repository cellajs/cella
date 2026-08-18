import { getTableName } from 'drizzle-orm';
import { appConfig, toColumnName } from 'shared';
import { entityTables } from '#/tables';

// Immutable column sets

const BASE_ENTITY_COLUMNS = ['id', 'tenant_id', 'entity_type', 'created_at', 'created_by'] as const;
const MEMBERSHIP_CHANNEL_ID_COLUMNS = appConfig.channelEntityTypes.map((type) =>
  toColumnName(appConfig.entityIdColumnKeys[type]),
);
const BASE_MEMBERSHIP_COLUMNS = ['tenant_id', 'channel_id', 'channel_type', ...MEMBERSHIP_CHANNEL_ID_COLUMNS] as const;

/** Product entities with a parent org (tasks, labels, attachments). */
export const productImmutableColumns = [...BASE_ENTITY_COLUMNS, 'organization_id'] as const;

/** Active memberships include user_id. */
export const membershipImmutableColumns = [...BASE_MEMBERSHIP_COLUMNS, 'user_id'] as const;

/** Inactive memberships allow mutable user_id for re-assignable invitations. */
export const inactiveMembershipImmutableColumns = BASE_MEMBERSHIP_COLUMNS;

// SQL builders

interface TableImmutabilityConfig {
  tableName: string;
  functionName: string;
}

/** Raises when any listed column changes. `IS DISTINCT FROM` catches NULL-to-value transitions. */
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

/** Trigger names. Exported so the side-effect migration emits the same names this file does. */
export const immutableKeysTriggerName = (tableName: string) => `${tableName}_immutable_keys_trigger`;
export const adminOnlyWriteTriggerName = (tableName: string) => `${tableName}_admin_only_write_trigger`;

function buildTriggerSQL(tableName: string, functionName: string): string {
  const triggerName = immutableKeysTriggerName(tableName);
  return `
DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName};
CREATE TRIGGER ${triggerName}
  BEFORE UPDATE ON ${tableName}
  FOR EACH ROW EXECUTE FUNCTION ${functionName}();`;
}

/** Write-guard trigger: covers INSERT, UPDATE and DELETE, blocking the write outright. */
function buildAdminOnlyWriteTriggerSQL(tableName: string): string {
  const triggerName = adminOnlyWriteTriggerName(tableName);
  return `
DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName};
CREATE TRIGGER ${triggerName}
  BEFORE INSERT OR UPDATE OR DELETE ON ${tableName}
  FOR EACH ROW EXECUTE FUNCTION admin_only_write_row();`;
}

// Pre-built trigger functions

export const baseEntityImmutabilityFunctionSQL = buildFunctionSQL('base_entity_immutable_keys', BASE_ENTITY_COLUMNS);

export const productImmutabilityFunctionSQL = buildFunctionSQL(
  'product_entity_immutable_keys',
  productImmutableColumns,
);

export const membershipImmutabilityFunctionSQL = buildFunctionSQL(
  'membership_immutable_keys',
  membershipImmutableColumns,
);

export const inactiveMembershipImmutabilityFunctionSQL = buildFunctionSQL(
  'inactive_membership_immutable_keys',
  inactiveMembershipImmutableColumns,
);

export const appendOnlyImmutabilityFunctionSQL = `
CREATE OR REPLACE FUNCTION append_only_immutable_row() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only: updates are not allowed', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;`;

/** Blocks runtime_role writes even if provider reconciliation restores table privileges. Admin operations stay allowed. */
export const adminOnlyWriteFunctionSQL = `
CREATE OR REPLACE FUNCTION admin_only_write_row() RETURNS TRIGGER AS $$
BEGIN
  IF current_user = 'runtime_role' THEN
    RAISE EXCEPTION 'Table % is not writable by %', TG_TABLE_NAME, current_user;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;`;

// Table to function mapping

const channelConfigs: TableImmutabilityConfig[] = appConfig.channelEntityTypes.map((t) => ({
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

/** Read-only for the app: `system_roles` decides who is a system admin, so writes must use the admin connection. */
const adminOnlyWriteConfigs: TableImmutabilityConfig[] = [
  { tableName: 'system_roles', functionName: 'admin_only_write_row' },
];

export const allImmutabilityTables: TableImmutabilityConfig[] = [
  ...channelConfigs,
  ...productWithParentConfigs,
  ...membershipConfigs,
  ...appendOnlyConfigs,
];

export const allAdminOnlyWriteTables: TableImmutabilityConfig[] = adminOnlyWriteConfigs;

/** Creation order: both migration emitters build from this list, so every function exists before its `CREATE TRIGGER`. */
export const allImmutabilityFunctionsSQL: string[] = [
  baseEntityImmutabilityFunctionSQL,
  productImmutabilityFunctionSQL,
  membershipImmutabilityFunctionSQL,
  inactiveMembershipImmutabilityFunctionSQL,
  appendOnlyImmutabilityFunctionSQL,
  adminOnlyWriteFunctionSQL,
];

// Combined SQL output

const baseEntityTables = channelConfigs;
const names = (configs: TableImmutabilityConfig[]) => configs.map((c) => c.tableName).join(', ');

/** All immutability functions and triggers. Run after migrations. */
export const immutabilityTriggersSQL = `
-- Functions (${allImmutabilityFunctionsSQL.length})
-- Base entities: ${names(baseEntityTables)}
-- Product entities with parent: ${names(productWithParentConfigs) || 'none'}
-- Memberships, inactive memberships
-- Append-only: ${names(appendOnlyConfigs)}
-- Admin-only writes: ${names(adminOnlyWriteConfigs)}
${allImmutabilityFunctionsSQL.join('\n')}

-- Immutable-keys triggers (${allImmutabilityTables.length} tables)
${allImmutabilityTables.map((t) => buildTriggerSQL(t.tableName, t.functionName)).join('\n')}

-- Write-guard triggers (${allAdminOnlyWriteTables.length} tables)
${allAdminOnlyWriteTables.map((t) => buildAdminOnlyWriteTriggerSQL(t.tableName)).join('\n')}
`;
