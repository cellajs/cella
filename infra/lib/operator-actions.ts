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
    label: 'Show status',
    key: 'observer',
    description: 'Health check: what is set up, what is live, and the next step. Read-only.',
  },
  runs: {
    label: 'Show runs',
    key: 'observer',
    description:
      "The environment's last deploys: when, which target, how each ended and where a failed one stopped, then one in full with the end of its log. Read-only.",
  },
  preview: {
    label: 'Preview changes',
    key: 'operator',
    description: 'The plan of "Review & apply changes" without its question, refreshed against the live stack. Read-only.',
  },
  apply: {
    label: 'Review & apply changes',
    key: 'operator',
    description:
      'See what differs between the code and the live stack, then apply it on your yes: database, VPC, buckets, DNS. Machine policies are written by "Update identities". Answer no to only look.',
  },
  'rotate-keys': {
    label: 'Rotate keys',
    key: 'owner',
    description:
      'Replace the CI deploy key, the observer key, every standing machine key and, where the runner serves this environment, the runner key and machine (the observer key is rewritten in every infra/.env.<mode> on this machine that holds it).',
  },
  'rotate-secrets': {
    label: 'Rotate secrets',
    key: 'operator',
    description:
      'Fresh database role passwords and rotatable generated secrets, every copy rewritten; the next deploy replaces every machine. Keys that protect stored data stay; third-party keys are pasted anew in "Manage runtime secrets".',
  },
  'rotate-passphrase': {
    label: 'Rotate passphrase',
    key: 'operator',
    description: 'Re-encrypt stack state with a new Pulumi passphrase and sync it.',
  },
  'operator-key': {
    label: 'Set up operator key',
    key: 'owner',
    description:
      "Create the app's operator application and a fresh key that works from your dedicated IP address only, in every environment. Replaces an earlier operator key; run it again to change the address.",
  },
  identity: {
    label: 'Update identities',
    key: 'owner',
    description:
      'Make the applications the service registry needs, write the machine policies, keep one standing key per machine identity, put the observer key on this machine, and delete the retired admin application once nothing needs it. Shows what differs first; asks for your Owner API key only when something must change.',
  },
  'start-deploy': {
    label: 'Start a deploy',
    key: 'operator',
    description:
      "Start one run of the environment's main job for its target (the environments file's line, or production's newest release) and follow it until it is deployed, blocked or failed.",
  },
  'runner-identity': {
    label: 'Set up the runner',
    key: 'owner',
    description:
      "Make the app's runner (its project, reserved address, application and key), let the operator reach it, and add this environment to the ones it starts deploys for in infra/runner.json. Rotate keys replaces its key.",
  },
  'runner-replace': {
    label: 'Replace the runner',
    key: 'operator',
    description: "Replace the runner's machine with one that runs the release and serves the environments infra/runner.json names.",
  },
  'repository-key': {
    label: 'Set repository read key',
    key: 'operator',
    description:
      "Store, replace or remove the read-only GitHub key a private repository needs: the builder fetches a release's commit with it. A repository anyone may read needs none.",
  },
  secrets: {
    label: 'Manage runtime secrets',
    key: 'operator',
    description: 'List, set, rotate, or delete the runtime secrets, and mint managed keys.',
  },
  'db-open': {
    label: 'Open public DB access',
    key: 'operator',
    description: 'Open a temporary DB endpoint locked to your IP and print the admin connection string (close it after).',
  },
  'db-seed': {
    label: 'Seed database',
    key: 'operator',
    description: 'Open the endpoint to your IP, run the backend seeds, and close it again. Never on production.',
  },
  'db-close': {
    label: 'Close public DB access',
    key: 'operator',
    description: 'Close the temporary public DB endpoint.',
  },
  'db-reset': {
    label: 'Reset database',
    key: 'operator',
    description: 'DESTRUCTIVE: wipe and rebuild the database empty (backup first).',
  },
  unlock: {
    label: 'Unlock stack',
    key: 'operator',
    description: 'Clear a stale stack lock and review the operations an interrupted run left in the Pulumi state.',
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
 * An action no row lists (`preview`, `repository-key`, `start-deploy`, `runner-identity`, `runner-replace`, `state-prune`)
 * runs only by its command.
 */
export const MENU_ROWS = {
  status: {
    group: 'observe',
    label: OPERATOR_ACTIONS.status.label,
    actions: ['status'],
    hint: 'read-only',
    description: OPERATOR_ACTIONS.status.description,
  },
  runs: {
    group: 'observe',
    label: OPERATOR_ACTIONS.runs.label,
    actions: ['runs'],
    hint: 'read-only',
    description: OPERATOR_ACTIONS.runs.description,
  },
  changes: {
    group: 'observe',
    label: OPERATOR_ACTIONS.apply.label,
    actions: ['apply'],
    hint: 'operator key',
    description: OPERATOR_ACTIONS.apply.description,
  },
  rotate: {
    group: 'change',
    label: 'Rotate keys & secrets',
    actions: ['rotate-keys', 'rotate-secrets', 'rotate-passphrase', 'operator-key'],
    hint: 'keys, secrets, passphrase, operator key',
    description:
      'Replace every Scaleway key or every secret the engine makes, re-encrypt the stack, or set up the operator key and its dedicated IP.',
  },
  secrets: {
    group: 'change',
    label: OPERATOR_ACTIONS.secrets.label,
    actions: ['secrets'],
    hint: 'operator key',
    description: `${OPERATOR_ACTIONS.secrets.description} A new value takes effect at the next deploy.`,
  },
  identity: {
    group: 'change',
    label: OPERATOR_ACTIONS.identity.label,
    actions: ['identity'],
    hint: 'Owner key',
    description: OPERATOR_ACTIONS.identity.description,
  },
  'db-open': {
    group: 'database',
    label: OPERATOR_ACTIONS['db-open'].label,
    actions: ['db-open', 'db-seed'],
    hint: 'operator key · temporary, locked to your IP',
    description: 'Open a temporary DB endpoint locked to your IP: to connect yourself, or to run the backend seeds and close it again.',
  },
  'db-close': {
    group: 'database',
    label: OPERATOR_ACTIONS['db-close'].label,
    actions: ['db-close'],
    hint: 'operator key',
    description: OPERATOR_ACTIONS['db-close'].description,
  },
  'db-reset': {
    group: 'database',
    label: OPERATOR_ACTIONS['db-reset'].label,
    actions: ['db-reset'],
    hint: 'operator key · DESTRUCTIVE',
    description: OPERATOR_ACTIONS['db-reset'].description,
  },
  repair: {
    group: 'recover',
    label: 'Repair stack',
    actions: ['unlock', 'resume'],
    hint: 'stack lock, setup',
    description: 'Clear a stale stack lock, or re-sync the setup.',
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
