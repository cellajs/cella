import { pc } from '../../lib/utils/cli-output';
import { inMenuSession, rememberedOperatorKey } from '../session';
import { isPromptAbort } from './abort';
import { ESCAPED, menuSelect } from './menu-select';

/** One way out of a failure: what it does, and the line under the list while it is highlighted. */
export interface WayOut<T extends string> {
  value: T;
  label: string;
  /** Dim on the right: where the row leads. */
  hint?: string;
  description: string;
}

/** The value of the row that leaves a failure. */
export const LEAVE = 'leave';

const BACK_LABEL = '← Back to menu';

/** The row that leaves a failure: back to the menu in a menu session, out of the CLI otherwise. */
export function leaveRow(): WayOut<typeof LEAVE> {
  return inMenuSession()
    ? { value: LEAVE, label: BACK_LABEL, description: 'The menu lists every action again.' }
    : { value: LEAVE, label: 'Quit', description: 'End this run.' };
}

/** The dim line under a failure's ways out when the run holds an operator key, or undefined. */
export function keptKeyNote(): string | undefined {
  return rememberedOperatorKey() ? 'Your operator key is kept for this run.' : undefined;
}

/** The value of the row that quits the CLI from the frame after a first setup. */
export const QUIT = 'quit';

/**
 * Ask what to do after a failure: `? What now?` over its rows, with `note` dim under the highlighted row's line. Esc and Ctrl-C pick the
 * row that leaves, else the last one; without a terminal nobody can answer, so it is picked at once.
 */
export async function whatNow<T extends string>(rows: ReadonlyArray<WayOut<T>>, note?: string): Promise<T> {
  const leave = rows.find((row) => row.value === LEAVE) ?? rows.at(-1);
  if (!leave) throw new Error('a failure needs a way out');
  if (!process.stdin.isTTY) return leave.value;
  const width = Math.max(...rows.map((row) => row.label.length));
  const picked = await menuSelect<T>({
    message: 'What now?',
    items: rows.map((row) => ({
      value: row.value,
      name: row.hint ? `${row.label.padEnd(width)}  ${pc.dim(row.hint)}` : row.label,
      description: note ? `${row.description}\n${pc.dim(note)}` : row.description,
    })),
  }).catch((error: unknown): typeof ESCAPED => {
    if (isPromptAbort(error)) return ESCAPED;
    throw error;
  });
  return picked === ESCAPED ? leave.value : picked;
}

/** The frame under a finished first setup, which has shown no menu yet: Open the menu first, on Enter, Esc and Ctrl-C alike, then Quit. */
export async function afterFirstSetup(): Promise<typeof LEAVE | typeof QUIT> {
  return whatNow<typeof LEAVE | typeof QUIT>([
    { value: LEAVE, label: 'Open the menu', description: 'Every action of the CLI, under the home screen.' },
    { value: QUIT, label: 'Quit', description: 'Leave the CLI.' },
  ]);
}

/**
 * The one row under an action that ended by itself: its output stays on screen until the operator goes on. Enter, Esc and Ctrl-C all return
 * to the menu, with a blank line between the row and the output.
 */
export async function backToMenu(): Promise<typeof LEAVE> {
  if (!process.stdin.isTTY) return LEAVE;
  await menuSelect({ message: '', items: [{ group: '' }, { name: BACK_LABEL, value: LEAVE }] }).catch((error: unknown) => {
    if (!isPromptAbort(error)) throw error;
  });
  return LEAVE;
}
