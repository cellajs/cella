import { pc } from '../../lib/utils/cli-output';
import { inMenuSession, rememberedOperatorKey } from '../session';
import { isPromptAbort } from './abort';
import { ESCAPED, menuSelect } from './menu-select';

/** One way out of a failure: the letter that picks it, what it does, and the line under the list while it is highlighted. */
export interface WayOut<T extends string> {
  key: string;
  value: T;
  label: string;
  /** Dim on the right: where the row leads. */
  hint?: string;
  description: string;
}

/** The value of the row that leaves a failure. */
export const LEAVE = 'leave';

/** The row that leaves a failure: back to the menu in a menu session, out of the CLI otherwise. */
export function leaveRow(): WayOut<typeof LEAVE> {
  return inMenuSession()
    ? { key: 'm', value: LEAVE, label: 'Back to the menu', description: 'The menu lists every action again.' }
    : { key: 'q', value: LEAVE, label: 'Quit', description: 'End this run.' };
}

/** The dim line under a failure's ways out when the run holds an operator key, or undefined. */
export function keptKeyNote(): string | undefined {
  return rememberedOperatorKey() ? 'Your operator key is kept for this run.' : undefined;
}

/**
 * Ask what to do after a failure: `? What now?` over letter rows, with `note` dim under the highlighted row's line. Esc and Ctrl-C pick the
 * last row, which leaves; without a terminal nobody can answer, so it is picked at once.
 */
export async function whatNow<T extends string>(rows: ReadonlyArray<WayOut<T>>, note?: string): Promise<T> {
  const leave = rows.at(-1);
  if (!leave) throw new Error('a failure needs a way out');
  if (!process.stdin.isTTY) return leave.value;
  const width = Math.max(...rows.map((row) => row.label.length));
  const picked = await menuSelect<T>({
    message: 'What now?',
    escape: 'back',
    items: rows.map((row) => ({
      value: row.value,
      name: `${pc.dim(row.key)}  ${row.hint ? `${row.label.padEnd(width)}  ${pc.dim(row.hint)}` : row.label}`,
      description: note ? `${row.description}\n${pc.dim(note)}` : row.description,
    })),
    hotkeys: Object.fromEntries(rows.map((row) => [row.key, row.value])),
  }).catch((error: unknown): typeof ESCAPED => {
    if (isPromptAbort(error)) return ESCAPED;
    throw error;
  });
  return picked === ESCAPED ? leave.value : picked;
}
