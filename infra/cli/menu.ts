import {
  actionDescription,
  actionLabel,
  CATEGORY_LABELS,
  type MenuCategory,
  OPERATOR_ACTIONS,
  type OperatorActionId,
  operatorAction,
} from '../lib/operator-actions';
import type { Environment, StackState } from '../lib/stack/bootstrap-stack-state';
import { pc } from '../lib/utils/cli-output';

/** What the menu knows about the stack and this machine, to say which rows can run. */
export interface MenuState {
  stackState: StackState;
  environment: Environment;
  /** The stack config carries an encryption salt, so there is a passphrase to rotate. */
  encrypted: boolean;
  /** This machine holds the admin application key. */
  hasAdminKey: boolean;
  /** The local exposure config says the public DB endpoint is open. */
  dbExposed: boolean;
  /** The instance's live public endpoints, when the admin application key read them in time. */
  liveEndpoints?: string[];
}

/** A menu row. A row that cannot run now stays in the list with `disabled` saying why. */
export interface MenuChoice<T extends string> {
  name: string;
  value: T;
  description?: string;
  disabled?: string;
}

/** Every action a submenu row starts; status runs from the main menu and returns to it. */
export type MenuAction = Exclude<OperatorActionId, 'status'>;

export const BACK = 'back';
export const QUIT = 'quit';

const NEEDS_BOOTSTRAPPED_STACK: readonly MenuAction[] = ['apply', 'preview', 'reset-database', 'seed-db', 'expose-db', 'unexpose-db'];

/** Why an action cannot run now, undefined when it can. Each reason names the action that lifts it, and stays short enough for one 80-column row. */
export function disabledReason(id: MenuAction, state: MenuState): string | undefined {
  if (id === 'seed-db' && state.environment === 'production') return 'seed data never goes to production';
  if (NEEDS_BOOTSTRAPPED_STACK.includes(id) && state.stackState !== 'bootstrapped') {
    return `needs a bootstrapped stack: run "${actionLabel('resume')}" first`;
  }
  if (id === 'rotate-passphrase' && !state.encrypted) return 'the stack has no encrypted state yet';
  if (id === 'geoip-refresh' && !state.hasAdminKey) return `needs the admin key: run "${actionLabel('fetch-admin-key')}"`;
  return undefined;
}

function row(id: MenuAction, state: MenuState, name = actionLabel(id), description = actionDescription(id)): MenuChoice<MenuAction> {
  const reason = disabledReason(id, state);
  return { name, value: id, description, ...(reason ? { disabled: `(${reason})` } : {}) };
}

/** The one DB access row: the close action while an endpoint is open (by the local exposure config, or live on the instance), the open action otherwise. */
export function dbAccessRow(state: MenuState): MenuChoice<MenuAction> {
  const live = state.liveEndpoints ?? [];
  if (!state.dbExposed && live.length > 0) {
    return row(
      'unexpose-db',
      state,
      `${actionLabel('unexpose-db')} ${pc.yellow('(OPEN with exposure off)')}`,
      actionDescription('unexpose-db', `The instance serves public endpoint ${live.join(', ')} although no exposure is configured: delete it.`),
    );
  }
  if (state.dbExposed) return row('unexpose-db', state, `${actionLabel('unexpose-db')} ${pc.yellow('(OPEN)')}`);
  return row('expose-db', state);
}

/** The rows of the main menu: status, the three submenus and the way out. */
export function categoryChoices(): Array<MenuChoice<'status' | MenuCategory | typeof QUIT>> {
  return [
    { name: actionLabel('status'), value: 'status', description: actionDescription('status') },
    { name: CATEGORY_LABELS.database, value: 'database', description: 'Reset, seed, or open temporary public access.' },
    { name: CATEGORY_LABELS.keys, value: 'keys', description: 'Rotate keys or the passphrase; manage runtime secrets.' },
    { name: CATEGORY_LABELS.stack, value: 'stack', description: 'Apply or preview infra changes, resume, unlock, or tear down.' },
    { name: 'Quit', value: QUIT, description: 'Leave the CLI.' },
  ];
}

/** The rows of one submenu, in table order, ending with the way back. The two DB access actions share one row. */
export function actionChoices(category: MenuCategory, state: MenuState): Array<MenuChoice<MenuAction | typeof BACK>> {
  const ids = (Object.keys(OPERATOR_ACTIONS) as OperatorActionId[]).filter(
    (id): id is MenuAction => id !== 'status' && operatorAction(id).category === category,
  );
  const rows = ids.filter((id) => id !== 'expose-db' && id !== 'unexpose-db').map((id) => row(id, state));
  if (category === 'database') rows.push(dbAccessRow(state));
  return [...rows, { name: '← Back', value: BACK, description: 'Return to the main menu.' }];
}

/** The line under the header that says which stack this run targets. Production is red, so a run against it never looks like a staging run. */
export function formatStackLine(stack: { slug: string; environment: Environment; state: StackState }): string {
  const mode = stack.environment === 'production' ? pc.bold(pc.red(stack.environment)) : pc.cyan(stack.environment);
  const file = stack.state === 'fresh' ? '' : pc.dim(` (Pulumi.${stack.environment}.yaml)`);
  return `${pc.bold(stack.slug)} · ${mode} · ${stack.state}${file}`;
}
