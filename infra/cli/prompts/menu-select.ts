import { emitKeypressEvents } from 'node:readline';
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
 * One menu of the CLI: a select with group headings, no wrap-around, every entry on screen and no help line. Esc leaves it and resolves to
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
        pageSize: 24,
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
