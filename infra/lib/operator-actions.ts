/** The Scaleway key an operator action runs with. */
export type KeyTier = 'none' | 'observer' | 'operator' | 'owner';

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
    label: 'Full status',
    key: 'observer',
    description: 'Every check in one table: what is set up, what is live, the security findings and the next step. Read-only.',
  },
  runs: {
    label: 'Deploy logs',
    key: 'observer',
    description:
      'The last deploys: when, which release, how each ended and where a failed one stopped, then one in full with the end of its log. Read-only.',
  },
  preview: {
    label: 'Preview changes',
    key: 'operator',
    description: 'The plan of "Review & apply changes" without its question, refreshed against the live stack. Read-only.',
  },
  apply: {
    label: 'Review & apply changes',
    key: 'operator',
    description: 'See what differs between code and live stack, and apply it on your yes.',
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
  'operator-key': {
    label: 'Set up operators',
    key: 'owner',
    description: "Make or repair the app's operator application and operators group.",
  },
  identity: {
    label: 'Update identities',
    key: 'owner',
    description: 'Write what differs from the declared identities. Asks for your Owner key only when something must change.',
  },
  'start-deploy': {
    label: 'Deploy now',
    key: 'operator',
    description: "Deploy the environment's target now and follow it step by step.",
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
  secrets: {
    label: 'Env vars & secrets',
    key: 'operator',
    description: 'The values the services read at boot, in one table. A new value reaches the machines at the next deploy.',
  },
  'db-open': {
    label: 'Open DB access',
    key: 'operator',
    description: 'Open a temporary public endpoint locked to your IP and print the admin connection string (close it after).',
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
    description: 'DESTRUCTIVE: wipe and rebuild the database empty (backup first).',
  },
  unlock: {
    label: 'Unlock',
    key: 'operator',
    description: 'Clear a stale lease (one deploy or action runs at a time) and review the operations an interrupted run left in the Pulumi state.',
  },
  resume: {
    label: 'Resume setup',
    key: 'operator',
    description: 'Continue an interrupted setup: re-sync config and self-heal missing keys.',
  },
  'state-prune': {
    label: 'Remove from state',
    key: 'operator',
    description: "Remove one resource from the stack's Pulumi state: one the program no longer declares and whose live object is gone already.",
  },
  teardown: {
    label: 'Tear down',
    key: 'owner',
    description: 'DESTRUCTIVE: delete everything that runs or costs, after a final dump. Uploads and the dump are kept.',
  },
} as const satisfies Record<string, OperatorAction>;

export type OperatorActionId = keyof typeof OPERATOR_ACTIONS;

/** The groups of the `pnpm infra` menu, in the order the menu lists them. */
export const MENU_GROUPS = {
  deploys: 'Deploys',
  configure: 'Configure',
  database: 'Database',
  account: 'Account',
  more: 'More',
} as const;

export type MenuGroup = keyof typeof MENU_GROUPS;

export interface MenuRow {
  group: MenuGroup;
  /** The row's name. A row with one action carries that action's label. */
  label: string;
  /** The actions behind the row; more than one opens a short pick. */
  actions: readonly OperatorActionId[];
  /** The letter that enters the row from the menu. */
  hotkey: string;
  /** Shown under the menu while the row is highlighted. */
  description: string;
}

/**
 * The rows of the `pnpm infra` menu, in menu order, grouped by what a person comes to do. `db-open` and `db-close` share one place: the
 * menu lists the one that applies. Every action has a row, so nothing of the CLI is reached by its command alone.
 */
export const MENU_ROWS = {
  deploy: {
    group: 'deploys',
    label: OPERATOR_ACTIONS['start-deploy'].label,
    actions: ['start-deploy'],
    hotkey: 'd',
    description: OPERATOR_ACTIONS['start-deploy'].description,
  },
  releases: {
    group: 'deploys',
    label: OPERATOR_ACTIONS.releases.label,
    actions: ['releases'],
    hotkey: 'r',
    description: OPERATOR_ACTIONS.releases.description,
  },
  runs: {
    group: 'deploys',
    label: OPERATOR_ACTIONS.runs.label,
    actions: ['runs'],
    hotkey: 'l',
    description: OPERATOR_ACTIONS.runs.description,
  },
  status: {
    group: 'deploys',
    label: OPERATOR_ACTIONS.status.label,
    actions: ['status'],
    hotkey: 's',
    description: OPERATOR_ACTIONS.status.description,
  },
  secrets: {
    group: 'configure',
    label: OPERATOR_ACTIONS.secrets.label,
    actions: ['secrets'],
    hotkey: 'e',
    description: OPERATOR_ACTIONS.secrets.description,
  },
  changes: {
    group: 'configure',
    label: 'Infrastructure changes',
    actions: ['apply', 'preview'],
    hotkey: 'a',
    description: 'What differs between code and live foundation: review and apply it, or only look.',
  },
  identity: {
    group: 'configure',
    label: OPERATOR_ACTIONS.identity.label,
    actions: ['identity'],
    hotkey: 'i',
    description: OPERATOR_ACTIONS.identity.description,
  },
  'db-open': {
    group: 'database',
    label: OPERATOR_ACTIONS['db-open'].label,
    actions: ['db-open', 'db-seed'],
    hotkey: 'p',
    description: 'Open a temporary public endpoint locked to your IP: to connect yourself, or to run the backend seeds and close it again.',
  },
  'db-close': {
    group: 'database',
    label: OPERATOR_ACTIONS['db-close'].label,
    actions: ['db-close'],
    hotkey: 'p',
    description: OPERATOR_ACTIONS['db-close'].description,
  },
  'db-reset': {
    group: 'database',
    label: OPERATOR_ACTIONS['db-reset'].label,
    actions: ['db-reset'],
    hotkey: 'x',
    description: OPERATOR_ACTIONS['db-reset'].description,
  },
  keys: {
    group: 'account',
    label: 'Operators & keys',
    actions: ['rotate-keys', 'rotate-secrets', 'operator-key', 'repository-key'],
    // `k` is the menu's vim-style up.
    hotkey: 'o',
    description: "Replace keys or secrets, set up the operators, or store a private repository's read key.",
  },
  repair: {
    group: 'more',
    label: 'Repair',
    actions: ['unlock', 'resume', 'state-prune'],
    hotkey: 'u',
    description: 'Clear a stale lease, continue an interrupted setup, or take a resource out of the Pulumi state.',
  },
  teardown: {
    group: 'more',
    label: OPERATOR_ACTIONS.teardown.label,
    actions: ['teardown'],
    hotkey: 't',
    description: OPERATOR_ACTIONS.teardown.description,
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
  'state-prune',
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

const KEY_SENTENCES = {
  none: 'Works without a Scaleway key.',
  observer: 'Reads with the observer key.',
  operator: 'Needs your operator key.',
  owner: 'Needs your Owner API key.',
} as const satisfies Record<KeyTier, string>;

const KEY_HINTS = { none: 'no key', observer: 'observer key', operator: 'operator key', owner: 'Owner key' } as const satisfies Record<
  KeyTier,
  string
>;

/** The description of an action in a pick: what it does, then the key it runs with. `what` replaces the table's sentence for an entry that depends on live state. */
export function actionDescription(id: OperatorActionId, what?: string): string {
  const action = operatorAction(id);
  return `${what ?? action.description} ${KEY_SENTENCES[action.key]}`;
}

/** The note on the right of an action in a pick: the key it runs with. */
export function actionHint(id: OperatorActionId): string {
  return KEY_HINTS[operatorAction(id).key];
}
