import { Separator } from '@inquirer/prompts';
import { actionLabel, MENU_ROWS, type MenuRowId, MORE_SECTIONS, menuRow, OPERATOR_ACTIONS, type OperatorActionId } from '../lib/operator-actions';
import type { Environment, StackState } from '../lib/stack/bootstrap-stack-state';
import { pc } from '../lib/utils/cli-output';

/** The step the home screen recommends, when one action of the CLI does it: the menu leads with it. */
export interface UpNext {
  action: OperatorActionId;
  description: string;
}

/** What the menu knows about the stack and this machine, to say which entries can run. */
export interface MenuState {
  stackState: StackState;
  environment: Environment;
  /** The local exposure config says the public DB endpoint is open. */
  dbExposed: boolean;
  /** The instance's live public endpoints, when the observer key read them in time. */
  liveEndpoints?: string[];
  upNext?: UpNext;
}

/** A selectable menu entry. An entry that cannot run now stays in the list with `disabled` saying why. */
export interface MenuChoice<T extends string> {
  name: string;
  value: T;
  description?: string;
  disabled?: string;
}

/** A menu entry, the heading of a group of entries (an empty one is a blank line), or a rule. */
export type MenuItem<T extends string> = MenuChoice<T> | { group: string } | Separator;

/** The rule above the way out of a menu, and between the sections of the More pick. */
export const RULE = new Separator(pc.dim('─'.repeat(40)));

export const BACK = 'back';
export const QUIT = 'quit';
/** The value of the row that runs the recommended step. */
export const UP_NEXT = 'up-next';

/** What the main menu resolves to: a row, the recommended step, or the way out. */
export type MainMenuValue = MenuRowId | typeof UP_NEXT | typeof QUIT;

const NEEDS_BOOTSTRAPPED_STACK: readonly OperatorActionId[] = [
  'apply',
  'preview',
  'db-reset',
  'db-seed',
  'db-open',
  'db-close',
  'deploy',
  'releases',
];

/** Why an action cannot run now, undefined when it can. Each reason names the action that lifts it, and stays short enough for one 80-column row. */
export function disabledReason(id: OperatorActionId, state: MenuState): string | undefined {
  if (id === 'db-seed' && state.environment === 'production') return 'seed data never goes to production';
  if (NEEDS_BOOTSTRAPPED_STACK.includes(id) && state.stackState !== 'bootstrapped') {
    return `needs a set-up environment: run "${actionLabel('resume')}"`;
  }
  return undefined;
}

/** Why a row cannot be entered: every action behind it is blocked. The reason is the first action's. */
export function rowDisabledReason(id: MenuRowId, state: MenuState): string | undefined {
  const reasons = menuRow(id).actions.map((action) => disabledReason(action, state));
  return reasons.every(Boolean) ? reasons[0] : undefined;
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

/** An entry's name: the label, with the open endpoint in yellow. */
function entryName(id: MenuRowId): string {
  return rowLabel(id).replace('(OPEN)', pc.yellow('(OPEN)'));
}

/**
 * The main menu: the recommended step and a blank line first when there is one, then every row with its description dim beside it, then
 * the way out. A disabled row shows its reason in place of the description.
 */
export function mainMenuItems(state: MenuState): Array<MenuItem<MainMenuValue>> {
  const items: Array<MenuItem<MainMenuValue>> = [];
  if (state.upNext) items.push({ name: `${pc.cyan('▶')}  ${state.upNext.description}`, value: UP_NEXT }, { group: '' });
  const rows = visibleRows(state);
  const width = Math.max(...rows.map((id) => rowLabel(id).length));
  for (const id of rows) {
    const reason = rowDisabledReason(id, state);
    const live = state.liveEndpoints ?? [];
    const stray = id === 'db-close' && !state.dbExposed && live.length > 0;
    items.push({
      name: reason ? rowLabel(id) : `${entryName(id)}${' '.repeat(width - rowLabel(id).length)}  ${pc.dim(menuRow(id).description)}`,
      value: id,
      ...(stray ? { description: `Public endpoint ${live.join(', ')} is open, though no exposure is configured: close it.` } : {}),
      ...(reason ? { disabled: `(${reason})` } : {}),
    });
  }
  items.push(RULE, { name: 'Quit', value: QUIT });
  return items;
}

/** An action's name in a pick: the label padded to the summary column, then its summary dim. A disabled entry shows the label alone, so the reason after it fits the row. */
function pickName(action: OperatorActionId, width: number, disabled: boolean): string {
  return disabled ? actionLabel(action) : `${actionLabel(action).padEnd(width)}  ${pc.dim(OPERATOR_ACTIONS[action].summary)}`;
}

/** The sections a row's pick lists its actions in: the More pick's, one for any other row. */
function pickSections(id: MenuRowId): Array<readonly OperatorActionId[]> {
  return id === 'more' ? Object.values(MORE_SECTIONS) : [menuRow(id).actions];
}

/** The pick a row with several actions opens: its actions with their summaries, a rule between sections, then the way back. */
export function pickItems(id: MenuRowId, state: MenuState): Array<MenuItem<OperatorActionId | typeof BACK>> {
  const width = Math.max(...menuRow(id).actions.map((action) => actionLabel(action).length));
  const items: Array<MenuItem<OperatorActionId | typeof BACK>> = [];
  for (const actions of pickSections(id)) {
    if (items.length) items.push(RULE);
    for (const action of actions) {
      const reason = disabledReason(action, state);
      items.push({ name: pickName(action, width, Boolean(reason)), value: action, ...(reason ? { disabled: `(${reason})` } : {}) });
    }
  }
  return [...items, RULE, { name: '← Back to menu', value: BACK }];
}
