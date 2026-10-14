import {
  actionCommand,
  actionDescription,
  actionHint,
  actionLabel,
  MENU_GROUPS,
  MENU_ROWS,
  type MenuGroup,
  type MenuRowId,
  menuPath,
  menuRow,
  type OperatorActionId,
} from '../lib/operator-actions';
import type { Environment, StackState } from '../lib/stack/bootstrap-stack-state';
import { pc } from '../lib/utils/cli-output';

/** What the menu knows about the stack and this machine, to say which entries can run. */
export interface MenuState {
  stackState: StackState;
  environment: Environment;
  /** The stack config carries an encryption salt, so there is a passphrase to rotate. */
  encrypted: boolean;
  /** The local exposure config says the public DB endpoint is open. */
  dbExposed: boolean;
  /** The instance's live public endpoints, when the observer key read them in time. */
  liveEndpoints?: string[];
}

/** A selectable menu entry. An entry that cannot run now stays in the list with `disabled` saying why. */
export interface MenuChoice<T extends string> {
  name: string;
  value: T;
  description?: string;
  disabled?: string;
}

/** A menu entry, or the heading of a group of entries. */
export type MenuItem<T extends string> = MenuChoice<T> | { group: string };

export const BACK = 'back';
export const QUIT = 'quit';

const NEEDS_BOOTSTRAPPED_STACK: readonly OperatorActionId[] = ['apply', 'preview', 'db-reset', 'db-seed', 'db-open', 'db-close'];

/** Why an action cannot run now, undefined when it can. Each reason names the action that lifts it, and stays short enough for one 80-column row. */
export function disabledReason(id: OperatorActionId, state: MenuState): string | undefined {
  if (id === 'db-seed' && state.environment === 'production') return 'seed data never goes to production';
  if (NEEDS_BOOTSTRAPPED_STACK.includes(id) && state.stackState !== 'bootstrapped') {
    return `needs a bootstrapped stack: run "${actionLabel('resume')}"`;
  }
  if (id === 'rotate-passphrase' && !state.encrypted) return 'the stack has no encrypted state yet';
  return undefined;
}

/** Why a row cannot be entered: every action behind it is blocked. The reason is the first action's. */
export function rowDisabledReason(id: MenuRowId, state: MenuState): string | undefined {
  const reasons = menuRow(id).actions.map((action) => disabledReason(action, state));
  return reasons.every(Boolean) ? reasons[0] : undefined;
}

/** A hint as the dim note on the right of an entry; the word DESTRUCTIVE keeps its colour. */
function styleHint(hint: string): string {
  return hint
    .split(' · ')
    .map((part) => (part === 'DESTRUCTIVE' ? pc.red(part) : pc.dim(part)))
    .join(pc.dim(' · '));
}

/** An entry's name: the label padded to the hint column, then the hint. A disabled entry shows the label alone, so the reason after it fits the row. */
function entryName(label: string, hint: string, width: number, disabled: boolean): string {
  return disabled ? label : `${label.padEnd(width)}  ${styleHint(hint)}`;
}

/** True when a public DB endpoint is open: by the local exposure config, or live on the instance. */
function dbIsOpen(state: MenuState): boolean {
  return state.dbExposed || (state.liveEndpoints?.length ?? 0) > 0;
}

/** The row ids the menu lists for a state: every row, with the one DB access row that applies. */
export function visibleRows(state: MenuState): MenuRowId[] {
  const hidden: MenuRowId = dbIsOpen(state) ? 'db-open' : 'db-close';
  return (Object.keys(MENU_ROWS) as MenuRowId[]).filter((id) => id !== hidden);
}

/** A row's label as the menu shows it: `›` marks a row that opens a pick, and the close row says the endpoint is open. */
function rowLabel(id: MenuRowId): string {
  const row = menuRow(id);
  if (id === 'db-close') return `${row.label} (OPEN)`;
  return row.actions.length > 1 ? `${row.label} ›` : row.label;
}

/** The main menu: every row under its group heading, then the way out. */
export function mainMenuItems(state: MenuState): Array<MenuItem<MenuRowId | typeof QUIT>> {
  const rows = visibleRows(state);
  const width = Math.max(...rows.map((id) => rowLabel(id).length));
  const items: Array<MenuItem<MenuRowId | typeof QUIT>> = [];
  for (const group of Object.keys(MENU_GROUPS) as MenuGroup[]) {
    items.push({ group: MENU_GROUPS[group] });
    for (const id of rows.filter((rowId) => menuRow(rowId).group === group)) {
      const row = menuRow(id);
      const reason = rowDisabledReason(id, state);
      const live = state.liveEndpoints ?? [];
      const stray = id === 'db-close' && !state.dbExposed && live.length > 0;
      items.push({
        // The open-endpoint marker is coloured after padding, so the hint column stays aligned.
        name: entryName(rowLabel(id), row.hint, width, Boolean(reason)).replace('(OPEN)', pc.yellow('(OPEN)')),
        value: id,
        description: stray
          ? `The instance serves public endpoint ${live.join(', ')} although no exposure is configured: delete it.`
          : row.description,
        ...(reason ? { disabled: `(${reason})` } : {}),
      });
    }
  }
  items.push({ group: '' }, { name: 'Quit', value: QUIT, description: 'Leave the CLI.' });
  return items;
}

/** The pick a row with several actions opens: its actions, then the way back. */
export function pickItems(id: MenuRowId, state: MenuState): Array<MenuChoice<OperatorActionId | typeof BACK>> {
  const actions = menuRow(id).actions;
  const width = Math.max(...actions.map((action) => actionLabel(action).length));
  const choices = actions.map((action): MenuChoice<OperatorActionId> => {
    const reason = disabledReason(action, state);
    return {
      name: entryName(actionLabel(action), actionHint(action), width, Boolean(reason)),
      value: action,
      description: actionDescription(action),
      ...(reason ? { disabled: `(${reason})` } : {}),
    };
  });
  return [...choices, { name: '← Back', value: BACK, description: 'Return to the menu.' }];
}

/** The line under the header that says which stack this run targets. Production is red, so a run against it never looks like a staging run. */
export function formatStackLine(stack: { slug: string; environment: Environment; state: StackState }): string {
  const mode = stack.environment === 'production' ? pc.bold(pc.red(stack.environment)) : pc.cyan(stack.environment);
  const file = stack.state === 'fresh' ? '' : pc.dim(` (Pulumi.${stack.environment}.yaml)`);
  return `${pc.bold(stack.slug)} · ${mode} · ${stack.state}${file}`;
}

/** What the header knows about the operator key: the application's address lock, and this machine's public address when it was found. */
export interface OperatorFacts {
  lock: { state: 'present' | 'absent' | 'unknown'; cidrs: string[]; open: boolean };
  /** Whether this machine's address is on the list; `unknown` without an address or a readable list. */
  verdict: 'inside' | 'outside' | 'unknown';
  address?: string;
}

/**
 * The header line on the operator key: whether the stack has one, and whether Scaleway takes it from this machine. A key refused for its
 * address looks like an empty stack on some APIs, so the operator reads here, before any action, that the address is the cause.
 */
export function formatOperatorLine(operator: OperatorFacts | undefined): string {
  const asked = `${pc.dim('○')} Operator key: asked when an action needs it`;
  if (!operator || operator.lock.state === 'unknown') return asked;
  const { lock, verdict, address } = operator;
  if (lock.state === 'absent') {
    return `${pc.dim('○')} Operator key: none yet, so privileged actions ask for your Owner API key ${pc.dim(`(${actionCommand('operator-key')} sets one up)`)}`;
  }
  if (lock.open) return `${pc.red('●')} Operator key: ${pc.red('works from every address')}: a rule of its policy has no address condition`;
  if (lock.cidrs.length === 0) return asked;
  const list = lock.cidrs.join(', ');
  if (verdict === 'outside') return `${pc.yellow('●')} Operator key: works from ${list} only; ${pc.yellow(`this machine is ${address}`)}`;
  return verdict === 'inside'
    ? `${pc.green('●')} Operator key: works from this address (${list})`
    : `${pc.dim('○')} Operator key: works from ${list}`;
}

/**
 * The header lines about what this machine can reach: where the operator key works, and whether the database has a public endpoint.
 * `liveEndpoints` is undefined when the instance was not read; the local exposure config then stands in, and a closed config gets no line.
 */
export function formatAccessLines(facts: {
  operator?: OperatorFacts;
  stackState: StackState;
  dbExposed: boolean;
  liveEndpoints?: string[];
}): string[] {
  const lines = [formatOperatorLine(facts.operator)];
  if (facts.stackState !== 'bootstrapped') return lines;
  const live = facts.liveEndpoints;
  if (live && live.length > 0) {
    const stray = facts.dbExposed ? '' : ' although exposure is off';
    lines.push(`${pc.yellow('●')} DB access: ${pc.yellow('OPEN')} at ${live.join(', ')}${stray}; close it with "${menuPath('db-close')}"`);
  } else if (live) {
    lines.push(
      facts.dbExposed
        ? `${pc.yellow('●')} DB access: exposure is configured, but the instance has no public endpoint`
        : `${pc.green('●')} DB access: private`,
    );
  } else if (facts.dbExposed) {
    lines.push(`${pc.yellow('●')} DB access: exposure is configured ${pc.dim('(the instance was not read)')}`);
  }
  return lines;
}
