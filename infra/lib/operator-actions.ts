/** The Scaleway key an operator action runs with. */
export type KeyTier = 'none' | 'admin' | 'owner';

export interface OperatorAction {
  /** The one name of the action: its menu entry, every prompt and hint that points at it, and the docs. */
  label: string;
  key: KeyTier;
  /** What the action does, shown under the menu while its entry is highlighted. */
  description: string;
}

/**
 * Every operator action of the infra CLI, keyed by the id that also runs it: `pnpm infra <id>`. A message that sends the operator to an
 * action names it through {@link actionLabel}, {@link menuPath} or {@link actionCommand}, so an action has one name wherever it is mentioned.
 */
export const OPERATOR_ACTIONS = {
  status: {
    label: 'Show status',
    key: 'none',
    description: 'Health check: what is set up, what is live, and the next step. Read-only.',
  },
  preview: {
    label: 'Preview changes',
    key: 'admin',
    description:
      'Plan what "Apply changes" would change, refreshed against the live stack (a CI deploy applies the same minus VM policy rules). Read-only.',
  },
  apply: {
    label: 'Apply changes',
    key: 'owner',
    description: 'Apply privileged changes: registry IAM principals and policies, database, VPC, network. Shows the plan and asks first.',
  },
  'rotate-keys': {
    label: 'Rotate keys',
    key: 'owner',
    description: 'Replace the CI deploy key and the admin application key with fresh ones (the admin key is rewritten in infra/.env.<mode>).',
  },
  'rotate-passphrase': {
    label: 'Rotate passphrase',
    key: 'admin',
    description: 'Re-encrypt stack state with a new Pulumi passphrase and sync it.',
  },
  secrets: {
    label: 'Manage runtime secrets',
    key: 'owner',
    description: 'List, set, rotate, or delete the runtime secrets, and mint managed keys.',
  },
  'db-open': {
    label: 'Open public DB access',
    key: 'owner',
    description: 'Open a temporary DB endpoint locked to your IP and print the admin connection string (close it after).',
  },
  'db-seed': {
    label: 'Seed database',
    key: 'owner',
    description: 'Open the endpoint to your IP, run the backend seeds, and close it again. Never on production.',
  },
  'db-close': {
    label: 'Close public DB access',
    key: 'owner',
    description: 'Close the temporary public DB endpoint.',
  },
  'db-reset': {
    label: 'Reset database',
    key: 'owner',
    description: 'DESTRUCTIVE: wipe and rebuild the database empty (backup first).',
  },
  unlock: {
    label: 'Unlock stack',
    key: 'admin',
    description: 'Clear a stale stack lock and review the operations an interrupted run left in the Pulumi state.',
  },
  resume: {
    label: 'Resume setup',
    key: 'owner',
    description: 'Re-sync config and GitHub secrets, and self-heal missing keys.',
  },
  'fetch-admin-key': {
    label: 'Fetch admin application key',
    key: 'owner',
    description: 'Put the admin application key in infra/.env.<mode> on this machine.',
  },
  'store-passphrase': {
    label: 'Store passphrase in keychain',
    key: 'none',
    description: 'Keep the Pulumi passphrase in the OS keychain; the env file keeps a reference.',
  },
  'geoip-refresh': {
    label: 'Refresh GeoIP data',
    key: 'admin',
    description: "Publish this month's DB-IP databases to the public bucket; API processes pick them up within a day.",
  },
  teardown: {
    label: 'Tear down stack',
    key: 'owner',
    description: 'DESTRUCTIVE: destroy every stack resource, then optionally delete the IAM principals.',
  },
} as const satisfies Record<string, OperatorAction>;

export type OperatorActionId = keyof typeof OPERATOR_ACTIONS;

/** The groups of the `pnpm infra` menu, in the order the menu lists them. */
export const MENU_GROUPS = {
  observe: 'Observe',
  change: 'Change',
  database: 'Database',
  recover: 'Recover',
  rare: 'Rare',
} as const;

export type MenuGroup = keyof typeof MENU_GROUPS;

export interface MenuRow {
  group: MenuGroup;
  /** The row's name. A row with one action carries that action's label. */
  label: string;
  /** The actions behind the row; more than one opens a short pick. */
  actions: readonly OperatorActionId[];
  /** The note on the right of the row: mostly the key the row needs. */
  hint: string;
  /** Shown under the menu while the row is highlighted. */
  description: string;
}

/**
 * The rows of the `pnpm infra` menu, in menu order. `db-open` and `db-close` share one place: the menu lists the one that applies.
 * An action no row lists (`geoip-refresh`, `store-passphrase`) runs only by its command.
 */
export const MENU_ROWS = {
  status: {
    group: 'observe',
    label: OPERATOR_ACTIONS.status.label,
    actions: ['status'],
    hint: 'read-only',
    description: OPERATOR_ACTIONS.status.description,
  },
  changes: {
    group: 'observe',
    label: 'Review & apply changes',
    actions: ['preview', 'apply'],
    hint: 'admin key to review · Owner key to apply',
    description: 'See what differs between the code and the live stack, then apply it: database, VPC, IAM principals and policies.',
  },
  rotate: {
    group: 'change',
    label: 'Rotate keys & secrets',
    actions: ['rotate-keys', 'rotate-passphrase'],
    hint: 'CI deploy key, admin key, passphrase',
    description: 'Replace the CI deploy key and the admin application key, or re-encrypt the stack with a new Pulumi passphrase.',
  },
  secrets: {
    group: 'change',
    label: OPERATOR_ACTIONS.secrets.label,
    actions: ['secrets'],
    hint: 'Owner key',
    description: `${OPERATOR_ACTIONS.secrets.description} A new value takes effect at the next deploy.`,
  },
  'db-open': {
    group: 'database',
    label: OPERATOR_ACTIONS['db-open'].label,
    actions: ['db-open', 'db-seed'],
    hint: 'Owner key · temporary, locked to your IP',
    description: 'Open a temporary DB endpoint locked to your IP: to connect yourself, or to run the backend seeds and close it again.',
  },
  'db-close': {
    group: 'database',
    label: OPERATOR_ACTIONS['db-close'].label,
    actions: ['db-close'],
    hint: 'Owner key',
    description: OPERATOR_ACTIONS['db-close'].description,
  },
  'db-reset': {
    group: 'database',
    label: OPERATOR_ACTIONS['db-reset'].label,
    actions: ['db-reset'],
    hint: 'Owner key · DESTRUCTIVE',
    description: OPERATOR_ACTIONS['db-reset'].description,
  },
  repair: {
    group: 'recover',
    label: 'Repair stack',
    actions: ['unlock', 'resume', 'fetch-admin-key'],
    hint: 'stack lock, setup, admin key',
    description: 'Clear a stale stack lock, re-sync the setup, or put the admin application key on this machine.',
  },
  teardown: {
    group: 'rare',
    label: OPERATOR_ACTIONS.teardown.label,
    actions: ['teardown'],
    hint: 'Owner key · DESTRUCTIVE',
    description: OPERATOR_ACTIONS.teardown.description,
  },
} as const satisfies Record<string, MenuRow>;

export type MenuRowId = keyof typeof MENU_ROWS;

/** One action of the table under the shared shape. */
function operatorAction(id: OperatorActionId): OperatorAction {
  return OPERATOR_ACTIONS[id];
}

/** One menu row under the shared shape. */
export function menuRow(id: MenuRowId): MenuRow {
  return MENU_ROWS[id];
}

/** True when `value` is the id of an operator action, for a command line that names one. */
export function isOperatorActionId(value: string): value is OperatorActionId {
  return Object.hasOwn(OPERATOR_ACTIONS, value);
}

/** The one name of an action, for a message that mentions it. */
export function actionLabel(id: OperatorActionId): string {
  return OPERATOR_ACTIONS[id].label;
}

/** The command that runs an action without the menu. */
export function actionCommand(id: OperatorActionId): string {
  return `pnpm infra ${id}`;
}

/**
 * Where an operator finds an action: `<row> → <action>` for an action picked inside a row, the label alone for a row of its own, and the
 * command for an action no row lists.
 */
export function menuPath(id: OperatorActionId): string {
  const label = actionLabel(id);
  const row = (Object.values(MENU_ROWS) as MenuRow[]).find((entry) => entry.actions.includes(id));
  if (!row) return actionCommand(id);
  return row.actions.length === 1 || row.label === label ? label : `${row.label} → ${label}`;
}

const KEY_SENTENCES = {
  none: 'Works without a Scaleway key.',
  admin: 'Uses the admin application key.',
  owner: 'Needs your Owner API key.',
} as const satisfies Record<KeyTier, string>;

const KEY_HINTS = { none: 'no key', admin: 'admin key', owner: 'Owner key' } as const satisfies Record<KeyTier, string>;

/** The description of an action in a pick: what it does, then the key it runs with. `what` replaces the table's sentence for an entry that depends on live state. */
export function actionDescription(id: OperatorActionId, what?: string): string {
  const action = operatorAction(id);
  return `${what ?? action.description} ${KEY_SENTENCES[action.key]}`;
}

/** The note on the right of an action in a pick: the key it runs with. */
export function actionHint(id: OperatorActionId): string {
  return KEY_HINTS[operatorAction(id).key];
}
