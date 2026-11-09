import { emitKeypressEvents } from 'node:readline';
import { Separator, select } from '@inquirer/prompts';
import { pc } from '../../lib/utils/cli-output';
import type { MenuItem } from '../menu';

/** What {@link menuSelect} resolves to when the operator leaves the menu with Esc (or `q` at the main menu) without choosing. */
export const ESCAPED: unique symbol = Symbol('menu-escaped');

export interface MenuSelectOptions<T extends string> {
  message: string;
  items: ReadonlyArray<MenuItem<T>>;
  /** The entry the cursor starts on. */
  default?: T;
  /** What leaving does here, for the help line: `back` in a pick, `quit` at the main menu, where `q` leaves too. */
  escape: 'back' | 'quit';
  /** Letters that choose an entry at once, by its value. */
  hotkeys?: Record<string, T>;
}

/**
 * One menu of the CLI: a select with group headings, no wrap-around, and every entry on screen. Esc leaves it and resolves to
 * {@link ESCAPED}; at the main menu `q` does the same, and a hotkey resolves to its entry. The menu clears itself when it is left, so the
 * screen never stacks old menus. Inquirer's select has no Esc or hotkey handling of its own, so a keypress listener aborts it through an
 * AbortController and the outcome is read after.
 */
export async function menuSelect<T extends string>(options: MenuSelectOptions<T>): Promise<T | typeof ESCAPED> {
  const controller = new AbortController();
  const quits = options.escape === 'quit';
  let chosen: T | undefined;
  const onKeypress = (_chunk: unknown, key?: { name?: string; ctrl?: boolean; meta?: boolean }) => {
    if (!key?.name || key.ctrl || key.meta) return;
    if (key.name === 'escape' || (quits && key.name === 'q')) return controller.abort();
    const hot = options.hotkeys?.[key.name];
    if (hot !== undefined) {
      chosen = hot;
      controller.abort();
    }
  };
  emitKeypressEvents(process.stdin);
  process.stdin.on('keypress', onKeypress);
  try {
    return await select<T>(
      {
        message: options.message,
        default: options.default,
        loop: false,
        pageSize: 24,
        choices: options.items.map((item) => ('group' in item ? new Separator(item.group ? pc.dim(` ${item.group}`) : ' ') : item)),
        theme: {
          style: {
            keysHelpTip: (keys: [key: string, action: string][]) =>
              [
                ...keys,
                ...(options.hotkeys ? [['letter', 'jump'] as [string, string]] : []),
                [quits ? 'esc/q' : 'esc', options.escape] as [string, string],
              ]
                .map(([key, action]) => `${pc.bold(key)} ${pc.dim(action)}`)
                .join(pc.dim(' • ')),
          },
        },
      },
      { signal: controller.signal, clearPromptOnDone: true },
    );
  } catch (error) {
    // An aborted prompt is the operator stepping out or jumping, not a failure.
    if (error instanceof Error && error.name === 'AbortPromptError') return chosen ?? ESCAPED;
    throw error;
  } finally {
    process.stdin.removeListener('keypress', onKeypress);
  }
}
