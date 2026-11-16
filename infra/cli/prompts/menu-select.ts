import { emitKeypressEvents } from 'node:readline';
import { stripVTControlCharacters } from 'node:util';
import { Separator, select } from '@inquirer/prompts';
import { pc } from '../../lib/utils/cli-output';
import type { MenuItem } from '../menu';

/** What {@link menuSelect} resolves to when the operator leaves the menu with Esc without choosing. */
export const ESCAPED: unique symbol = Symbol('menu-escaped');

export interface MenuSelectOptions<T extends string> {
  /** The question above the entries; an empty one leaves the list alone, without the `?` line. */
  message: string;
  items: ReadonlyArray<MenuItem<T>>;
  /** The entry the cursor starts on. */
  default?: T;
}

/**
 * The page fills the terminal less the question and the tallest description under it. A prompt taller than the terminal leaves a copy of
 * its top on every redraw.
 */
function pageSize({ message, items }: MenuSelectOptions<string>): number {
  const { rows = 24, columns = 80 } = process.stdout;
  const lines = (text: string) => Math.max(1, Math.ceil(stripVTControlCharacters(text).length / columns));
  const description = Math.max(0, ...items.map((item) => ('description' in item && item.description ? lines(item.description) : 0)));
  return Math.max(3, rows - lines(message) - description - 1);
}

/**
 * One menu of the CLI: a select with group headings, no wrap-around, as many entries as the terminal holds and no help line. Esc leaves it and resolves to
 * {@link ESCAPED}. The menu clears itself when it is left: the screen never stacks old menus. Inquirer's select has no Esc of its own, and
 * a keypress listener aborts it through an AbortController.
 */
export async function menuSelect<T extends string>(options: MenuSelectOptions<T>): Promise<T | typeof ESCAPED> {
  const controller = new AbortController();
  // Node 26 reports a lone Esc with `meta` set: the name alone matches it.
  const onKeypress = (_chunk: unknown, key?: { name?: string; ctrl?: boolean }) => {
    if (key?.name === 'escape' && !key.ctrl) controller.abort();
  };
  emitKeypressEvents(process.stdin);
  process.stdin.on('keypress', onKeypress);
  try {
    return await select<T>(
      {
        message: options.message,
        default: options.default,
        loop: false,
        pageSize: pageSize(options),
        choices: options.items.map((item) => ('group' in item ? new Separator(item.group ? pc.dim(` ${item.group}`) : ' ') : item)),
        theme: { ...(options.message ? {} : { prefix: '' }), style: { keysHelpTip: () => '' } },
      },
      { signal: controller.signal, clearPromptOnDone: true },
    );
  } catch (error) {
    // An aborted prompt is the operator stepping out, not a failure.
    if (error instanceof Error && error.name === 'AbortPromptError') return ESCAPED;
    throw error;
  } finally {
    process.stdin.removeListener('keypress', onKeypress);
  }
}
