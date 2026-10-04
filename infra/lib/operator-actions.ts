/** The Scaleway key an operator action runs with. */
export type KeyTier = 'none' | 'admin' | 'owner';

/** The submenus of `pnpm infra`. */
export type MenuCategory = 'database' | 'keys' | 'stack';

export interface OperatorAction {
  /** The one name of the action: its menu row, every prompt and hint that points at it, and the docs. */
  label: string;
  /** The submenu the row sits in; absent for a row of the main menu. */
  category?: MenuCategory;
  key: KeyTier;
  /** What the action does, shown under the menu while its row is highlighted. */
  description: string;
}

export const CATEGORY_LABELS = {
  database: 'Manage database',
  keys: 'Manage keys & secrets',
  stack: 'Stack setup',
} as const satisfies Record<MenuCategory, string>;

/**
 * Every operator action of the infra CLI. The menu is built from this table, and a message that sends the operator to an action names it
 * through {@link actionLabel} or {@link menuPath}, so an action has one name wherever it is mentioned.
 */
export const OPERATOR_ACTIONS = {
  status: {
    label: 'Show status',
    key: 'none',
    description: 'Health check: what is set up, what is live, and the next step. Read-only.',
  },
  'reset-database': {
    label: 'Reset database',
    category: 'database',
    key: 'owner',
    description: 'DESTRUCTIVE: wipe and rebuild the database empty (backup first).',
  },
  'seed-db': {
    label: 'Seed database',
    category: 'database',
    key: 'owner',
    description: 'Load seed data into a non-production database.',
  },
  'expose-db': {
    label: 'Open public DB access',
    category: 'database',
    key: 'owner',
    description: 'Open a temporary DB endpoint locked to your IP (close it after).',
  },
  'unexpose-db': {
    label: 'Close public DB access',
    category: 'database',
    key: 'owner',
    description: 'Close the temporary public DB endpoint.',
  },
  rotate: {
    label: 'Rotate keys',
    category: 'keys',
    key: 'owner',
    description: 'Replace the CI deploy key and the admin application key with fresh ones (the admin key is rewritten in infra/.env.<mode>).',
  },
  'rotate-passphrase': {
    label: 'Rotate passphrase',
    category: 'keys',
    key: 'admin',
    description: 'Re-encrypt stack state with a new Pulumi passphrase and sync it.',
  },
  secrets: {
    label: 'Manage runtime secrets',
    category: 'keys',
    key: 'owner',
    description: 'List, set, rotate, or delete the runtime secrets.',
  },
  'fetch-admin-key': {
    label: 'Fetch admin application key',
    category: 'keys',
    key: 'owner',
    description: 'Put the admin application key in infra/.env.<mode> on this machine.',
  },
  'store-passphrase': {
    label: 'Store passphrase in keychain',
    category: 'keys',
    key: 'none',
    description: 'Keep the Pulumi passphrase in the OS keychain; the env file keeps a reference.',
  },
  apply: {
    label: 'Apply infra change',
    category: 'stack',
    key: 'owner',
    description: 'Apply privileged changes: registry IAM principals and policies, database, VPC, network.',
  },
  preview: {
    label: 'Preview',
    category: 'stack',
    key: 'admin',
    description: 'Dry run of an Apply infra change (a CI deploy applies the same minus VM policy rules). Read-only.',
  },
  resume: {
    label: 'Resume',
    category: 'stack',
    key: 'owner',
    description: 'Re-sync config and GitHub secrets, and self-heal missing keys.',
  },
  unlock: {
    label: 'Unlock',
    category: 'stack',
    key: 'admin',
    description: 'Clear a stale lock and review the operations an interrupted run left in the Pulumi state.',
  },
  'geoip-refresh': {
    label: 'Refresh GeoIP data',
    category: 'stack',
    key: 'admin',
    description: "Publish this month's DB-IP databases to the public bucket; API processes pick them up within a day.",
  },
  teardown: {
    label: 'Tear down stack',
    category: 'stack',
    key: 'owner',
    description: 'DESTRUCTIVE: destroy every stack resource, then optionally delete the IAM principals.',
  },
} as const satisfies Record<string, OperatorAction>;

export type OperatorActionId = keyof typeof OPERATOR_ACTIONS;

/** One row of the table under the shared shape, so an optional field reads the same for every id. */
export function operatorAction(id: OperatorActionId): OperatorAction {
  return OPERATOR_ACTIONS[id];
}

/** The one name of an action, for a message that mentions it. */
export function actionLabel(id: OperatorActionId): string {
  return OPERATOR_ACTIONS[id].label;
}

/** Where `pnpm infra` lists an action: `<submenu> → <label>`, or the label alone for a row of the main menu. */
export function menuPath(id: OperatorActionId): string {
  const { category, label } = operatorAction(id);
  return category ? `${CATEGORY_LABELS[category]} → ${label}` : label;
}

const KEY_SENTENCES = {
  none: 'Works without a Scaleway key.',
  admin: 'Uses the admin application key.',
  owner: 'Needs your Owner API key.',
} as const satisfies Record<KeyTier, string>;

/** The menu description of an action: what it does, then the key it runs with. `what` replaces the table's sentence for a row that depends on live state. */
export function actionDescription(id: OperatorActionId, what?: string): string {
  const action = operatorAction(id);
  return `${what ?? action.description} ${KEY_SENTENCES[action.key]}`;
}
