/** The Scaleway key an operator action runs with. */
export type KeyTier = 'none' | 'observer' | 'operator' | 'owner';

export interface OperatorAction {
  /** The one name of the action: its menu entry, every prompt and hint that points at it, and the docs. */
  label: string;
  key: KeyTier;
  /** What the action does, shown under the menu while its entry is highlighted: one line of at most 96 characters that names no key. */
  description: string;
}

/**
 * Every operator action of the infra CLI, keyed by the id that also runs it: `pnpm infra <id>`. A message that sends the operator to an
 * action names it through {@link actionLabel}, {@link menuPath} or {@link actionCommand}, so an action has one name wherever it is mentioned.
 */
export const OPERATOR_ACTIONS = {
  status: {
    label: 'Full status',
    key: 'observer',
    description: 'Every check and finding, what it means and what fixes it. Read-only.',
  },
  logs: {
    label: 'Deploy logs',
    key: 'observer',
    description: 'The last deploys and how each ended, then one in full with the end of its log. Read-only.',
  },
  preview: {
    label: 'Preview changes',
    key: 'operator',
    description: 'The changes "Review & apply changes" would make, read fresh against what runs. Read-only.',
  },
  apply: {
    label: 'Review & apply changes',
    key: 'operator',
    description: 'See what differs between the code and what runs, and apply it on your yes.',
  },
  'rotate-keys': {
    label: 'Rotate keys',
    key: 'owner',
    description: 'Replace the deploy and uploads keys, then redeploy so no machine keeps an old one.',
  },
  'rotate-secrets': {
    label: 'Rotate secrets',
    key: 'operator',
    description: 'New database passwords and generated values, then a redeploy of what serves.',
  },
  operators: {
    label: 'Set up operators',
    key: 'owner',
    description: "Make or repair the app's operator application and operators group.",
  },
  identities: {
    label: 'Update identities',
    key: 'owner',
    description: 'Write what differs from the declared identities. Asks for a key only when something must change.',
  },
  deploy: {
    label: 'Deploy now',
    key: 'operator',
    description: 'Deploy the target now, without waiting for the scheduled run, and follow it step by step.',
  },
  releases: {
    label: 'Releases & roll back',
    key: 'operator',
    description: 'The last releases and how each deploy ended; pick an earlier one to deploy it again.',
  },
  'repository-key': {
    label: 'Set repository read key',
    key: 'operator',
    description: 'Store, replace or remove the read-only GitHub key a private repository needs.',
  },
  env: {
    label: 'Env vars & secrets',
    key: 'operator',
    description: 'The values the services read at boot. A changed value reaches the machines at the next deploy.',
  },
  'env-import': {
    label: 'Import a .env file',
    key: 'operator',
    description: 'Set the values a .env file holds, such as one from another host, after one confirmation.',
  },
  'db-open': {
    label: 'Open DB access',
    key: 'operator',
    description: 'Open a public endpoint to your IP and print the admin connection string. Close it when done.',
  },
  'db-seed': {
    label: 'Seed database',
    key: 'operator',
    description: 'Open the endpoint to your IP, run the backend seeds, and close it again. Never on production.',
  },
  'db-close': {
    label: 'Close DB access',
    key: 'operator',
    description: 'Close the temporary public endpoint.',
  },
  'db-reset': {
    label: 'Reset database',
    key: 'operator',
    description: 'Wipe the database and rebuild it empty, after a backup.',
  },
  unlock: {
    label: 'Unlock',
    key: 'operator',
    description: 'Clear the lease a stopped run left, and review what it left unfinished in the Pulumi state.',
  },
  resume: {
    label: 'Resume setup',
    key: 'operator',
    description: 'Continue an interrupted setup: re-sync config and self-heal missing keys.',
  },
  'state-remove': {
    label: 'Remove from state',
    key: 'operator',
    description: 'Take out of the Pulumi state a resource the code no longer declares and that is gone already.',
  },
  teardown: {
    label: 'Tear down',
    key: 'owner',
    description: 'Delete everything that runs or costs, after a final dump that is kept.',
  },
} as const satisfies Record<string, OperatorAction>;

export type OperatorActionId = keyof typeof OPERATOR_ACTIONS;

export interface MenuRow {
  /** The row's name. A row with one action carries that action's label. */
  label: string;
  /** The actions behind the row; more than one opens a short pick. */
  actions: readonly OperatorActionId[];
  /** Shown dim beside the row: a lowercase phrase that fits one 80-column line with the label. */
  description: string;
}

/** The actions a person runs rarely, under the headings of the More pick, in pick order. */
export const MORE_SECTIONS = {
  'Deploys & changes': ['deploy', 'preview'],
  'Keys & access': ['rotate-keys', 'rotate-secrets', 'operators', 'identities', 'repository-key'],
  Repair: ['unlock', 'resume', 'state-remove'],
  Database: ['db-seed', 'db-reset'],
  Environment: ['env-import', 'teardown'],
} as const satisfies Record<string, readonly OperatorActionId[]>;

/** A row of the menu for one action, under its label. */
function actionRow(id: OperatorActionId, description: string): MenuRow {
  return { label: actionLabel(id), actions: [id], description };
}

/**
 * The rows of the `pnpm infra` menu, in menu order: the daily ones by how often a person comes for them, then More with the rest.
 * `db-open` and `db-close` share one place: the menu lists the one that applies. No action is reached by its command alone: each has a row.
 */
export const MENU_ROWS = {
  status: actionRow('status', 'every check and finding, and what fixes it'),
  apply: actionRow('apply', 'what differs from what runs, applied on your yes'),
  env: actionRow('env', 'the values the services read at boot'),
  releases: actionRow('releases', 'the last releases; deploy an earlier one again'),
  logs: actionRow('logs', 'the last deploys and how each ended'),
  'db-open': actionRow('db-open', 'a public endpoint to your IP, until you close it'),
  'db-close': actionRow('db-close', 'close the temporary public endpoint'),
  more: {
    label: 'More',
    actions: Object.values(MORE_SECTIONS).flat(),
    description: 'deploy now, keys, repairs, the database, teardown',
  },
} as const satisfies Record<string, MenuRow>;

export type MenuRowId = keyof typeof MENU_ROWS;

/** The actions that run the Pulumi CLI: the ones that need it installed, at the SDK's version. */
export const PULUMI_ACTIONS: readonly OperatorActionId[] = [
  'apply',
  'preview',
  'resume',
  'rotate-secrets',
  'db-open',
  'db-seed',
  'db-close',
  'db-reset',
  'unlock',
  'state-remove',
  'teardown',
];

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

const KEY_HINTS = { none: 'no key', observer: 'observer key', operator: 'operator key', owner: 'Owner key' } as const satisfies Record<
  KeyTier,
  string
>;

/** The note on the right of an action in a pick: the key it runs with. */
export function actionHint(id: OperatorActionId): string {
  return KEY_HINTS[operatorAction(id).key];
}
