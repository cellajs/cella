import {
  actionDescription,
  actionHint,
  actionLabel,
  MENU_GROUPS,
  MENU_ROWS,
  type MenuGroup,
  type MenuRowId,
  menuRow,
  type OperatorActionId,
} from '../lib/operator-actions';
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

/** A menu entry, or the heading of a group of entries. */
export type MenuItem<T extends string> = MenuChoice<T> | { group: string };

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
  'start-deploy',
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

/** An entry's name: its hotkey dim, then the label; the destructive ones say so. */
function entryName(id: MenuRowId): string {
  const destructive = id === 'db-reset' || id === 'teardown' ? `  ${pc.red('destructive')}` : '';
  return `${pc.dim(menuRow(id).hotkey)}  ${rowLabel(id)}${destructive}`.replace('(OPEN)', pc.yellow('(OPEN)'));
}

/** The hotkeys of the rows a state lists and can run, by letter: the two DB access rows share theirs, as one of them is listed. */
export function menuHotkeys(state: MenuState): Record<string, MainMenuValue> {
  return Object.fromEntries(
    visibleRows(state)
      .filter((id) => !rowDisabledReason(id, state))
      .map((id) => [menuRow(id).hotkey, id]),
  );
}

/** The main menu: the recommended step first when there is one, then every row under its group heading, then the way out. */
export function mainMenuItems(state: MenuState): Array<MenuItem<MainMenuValue>> {
  const rows = visibleRows(state);
  const items: Array<MenuItem<MainMenuValue>> = [];
  if (state.upNext) {
    items.push({ group: '' });
    items.push({
      name: `${pc.cyan('▶')}  Up next: ${state.upNext.description}`,
      value: UP_NEXT,
      description: actionDescription(state.upNext.action),
    });
  }
  for (const group of Object.keys(MENU_GROUPS) as MenuGroup[]) {
    items.push({ group: MENU_GROUPS[group] });
    for (const id of rows.filter((rowId) => menuRow(rowId).group === group)) {
      const row = menuRow(id);
      const reason = rowDisabledReason(id, state);
      const live = state.liveEndpoints ?? [];
      const stray = id === 'db-close' && !state.dbExposed && live.length > 0;
      items.push({
        name: reason ? rowLabel(id) : entryName(id),
        value: id,
        description: stray
          ? `The instance serves public endpoint ${live.join(', ')} although no exposure is configured: delete it.`
          : row.description,
        ...(reason ? { disabled: `(${reason})` } : {}),
      });
    }
  }
  items.push({ group: '' }, { name: `${pc.dim('q')}  Quit`, value: QUIT, description: 'Leave the CLI.' });
  return items;
}

/** An action's name in a pick: the label padded to the hint column, then the key it runs with. A disabled entry shows the label alone, so the reason after it fits the row. */
function pickName(action: OperatorActionId, width: number, disabled: boolean): string {
  return disabled ? actionLabel(action) : `${actionLabel(action).padEnd(width)}  ${pc.dim(actionHint(action))}`;
}

/** The pick a row with several actions opens: its actions, then the way back. */
export function pickItems(id: MenuRowId, state: MenuState): Array<MenuChoice<OperatorActionId | typeof BACK>> {
  const actions = menuRow(id).actions;
  const width = Math.max(...actions.map((action) => actionLabel(action).length));
  const choices = actions.map((action): MenuChoice<OperatorActionId> => {
    const reason = disabledReason(action, state);
    return {
      name: pickName(action, width, Boolean(reason)),
      value: action,
      description: actionDescription(action),
      ...(reason ? { disabled: `(${reason})` } : {}),
    };
  });
  return [...choices, { name: '← Back', value: BACK, description: 'Return to the menu.' }];
}

/** The line that says which environment this run targets. Production is red, so a run against it never looks like a staging run. */
export function formatStackLine(stack: { slug: string; environment: Environment; state: StackState }): string {
  const mode = stack.environment === 'production' ? pc.bold(pc.red(stack.environment)) : pc.cyan(stack.environment);
  const state = stack.state === 'bootstrapped' ? '' : stack.state === 'fresh' ? pc.dim(' · new') : pc.dim(' · setup not finished');
  return `${pc.cyan('⧈')} ${pc.bold(stack.slug)} · ${mode}${state}`;
}
