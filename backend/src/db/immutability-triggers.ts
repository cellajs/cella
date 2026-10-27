import { getTableName } from 'drizzle-orm';
import { appConfig, toColumnName } from 'shared';
import { entityTables } from '#/tables';

const baseEntityColumns = ['id', 'tenant_id', 'entity_type', 'created_at', 'created_by'] as const;
const membershipChannelIdColumns = appConfig.channelEntityTypes.map((type) => toColumnName(appConfig.entityIdColumnKeys[type]));

/** Every product table carries `organization_id`, which never changes either. */
const productImmutableColumns = [...baseEntityColumns, 'organization_id'] as const;

/** Inactive memberships allow mutable user_id for re-assignable invitations. */
const inactiveMembershipImmutableColumns = ['tenant_id', 'channel_id', 'channel_type', ...membershipChannelIdColumns] as const;

/** Active memberships include user_id. */
export const membershipImmutableColumns = [...inactiveMembershipImmutableColumns, 'user_id'] as const;

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

const baseEntityImmutabilityFunctionSQL = buildFunctionSQL('base_entity_immutable_keys', baseEntityColumns);

const productImmutabilityFunctionSQL = buildFunctionSQL('product_entity_immutable_keys', productImmutableColumns);

const membershipImmutabilityFunctionSQL = buildFunctionSQL('membership_immutable_keys', membershipImmutableColumns);

const inactiveMembershipImmutabilityFunctionSQL = buildFunctionSQL('inactive_membership_immutable_keys', inactiveMembershipImmutableColumns);

const appendOnlyImmutabilityFunctionSQL = `
CREATE OR REPLACE FUNCTION append_only_immutable_row() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only: updates are not allowed', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;`;

/** Blocks runtime_role writes even if provider reconciliation restores table privileges. Admin operations stay allowed. */
const adminOnlyWriteFunctionSQL = `
CREATE OR REPLACE FUNCTION admin_only_write_row() RETURNS TRIGGER AS $$
BEGIN
  IF current_user = 'runtime_role' THEN
    RAISE EXCEPTION 'Table % is not writable by %', TG_TABLE_NAME, current_user;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;`;

const channelConfigs: TableImmutabilityConfig[] = appConfig.channelEntityTypes.map((t) => ({
  tableName: getTableName(entityTables[t]),
  functionName: 'base_entity_immutable_keys',
}));

const productConfigs: TableImmutabilityConfig[] = appConfig.productEntityTypes.map((t) => ({
  tableName: getTableName(entityTables[t]),
  functionName: 'product_entity_immutable_keys',
}));

const membershipConfigs: TableImmutabilityConfig[] = [
  { tableName: 'memberships', functionName: 'membership_immutable_keys' },
  { tableName: 'inactive_memberships', functionName: 'inactive_membership_immutable_keys' },
];

const appendOnlyConfigs: TableImmutabilityConfig[] = [{ tableName: 'activities', functionName: 'append_only_immutable_row' }];

/** Each table with the trigger function that refuses a change of its immutable columns or, for `activities`, any update. */
export const allImmutabilityTables: TableImmutabilityConfig[] = [...channelConfigs, ...productConfigs, ...membershipConfigs, ...appendOnlyConfigs];

/** Read-only for the app: `system_roles` decides who is a system admin, so writes must use the admin connection. */
export const allAdminOnlyWriteTables: TableImmutabilityConfig[] = [{ tableName: 'system_roles', functionName: 'admin_only_write_row' }];

/** Creation order: both migration emitters build from this list, so every function exists before its `CREATE TRIGGER`. */
export const allImmutabilityFunctionsSQL: string[] = [
  baseEntityImmutabilityFunctionSQL,
  productImmutabilityFunctionSQL,
  membershipImmutabilityFunctionSQL,
  inactiveMembershipImmutabilityFunctionSQL,
  appendOnlyImmutabilityFunctionSQL,
  adminOnlyWriteFunctionSQL,
];
