import { emitKeypressEvents } from 'node:readline';
import { createPrompt, isEnterKey, isTabKey, makeTheme, type Status, useKeypress, usePrefix, useState } from '@inquirer/core';
import { select as inquirerSelect } from '@inquirer/prompts';
import { pc } from '../../lib/utils/cli-output';
import { inMenuSession, recalledAnswer, rememberAnswer } from '../session';

/** Thrown when the operator presses Esc at a prompt: a flow goes back one step, and its first step back to the menu. */
export class PromptBack extends Error {
  constructor() {
    super('the operator stepped back');
    this.name = 'PromptBack';
  }
}

/** The help line under a prompt: its own keys, then `ctrl-c menu` in a menu session and `esc back`. */
export function helpTip(keys: Array<[key: string, action: string]>): string {
  return [...keys, ...(inMenuSession() ? [['ctrl-c', 'menu'] as [string, string]] : []), ['esc', 'back'] as [string, string]]
    .map(([key, action]) => `${pc.bold(key)} ${pc.dim(action)}`)
    .join(pc.dim(' • '));
}

/** The context an Inquirer prompt runs in: its abort signal, and whether it erases itself when it ends. */
export interface PromptContext {
  signal: AbortSignal;
  clearPromptOnDone: boolean;
}

/**
 * Run one prompt so Esc rejects it with {@link PromptBack} and erases it. Inquirer's prompts have no Esc of their own, so a keypress
 * listener aborts the prompt through its signal, as menuSelect does; Inquirer reads the erase flag only once the prompt ends. Node 26
 * reports a lone Esc with `meta` set, which the name alone matches.
 */
export async function withBack<T>(ask: (context: PromptContext) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const context: PromptContext = { signal: controller.signal, clearPromptOnDone: false };
  const onKeypress = (_chunk: unknown, key?: { name?: string }) => {
    if (key?.name !== 'escape') return;
    context.clearPromptOnDone = true;
    controller.abort();
  };
  emitKeypressEvents(process.stdin);
  process.stdin.on('keypress', onKeypress);
  try {
    return await ask(context);
  } catch (error) {
    if (controller.signal.aborted && error instanceof Error && error.name === 'AbortPromptError') throw new PromptBack();
    throw error;
  } finally {
    process.stdin.removeListener('keypress', onKeypress);
  }
}

/**
 * Run a flow's prompts as steps: Esc at a step goes back to the one before, whose prompt offers its earlier answer when it has an `id`, and
 * Esc at the first leaves the flow with {@link PromptBack}.
 */
export async function steps(list: ReadonlyArray<() => Promise<void>>): Promise<void> {
  for (let at = 0; at < list.length; ) {
    try {
      await list[at]?.();
      at++;
    } catch (error) {
      if (!(error instanceof PromptBack) || at === 0) throw error;
      at--;
    }
  }
}

/** The answer a y/n line gives: empty takes the default, and undefined is no answer. */
function yesOrNo(line: string, fallback: boolean): boolean | undefined {
  const value = line.trim().toLowerCase();
  if (value === '') return fallback;
  if ('yes'.startsWith(value)) return true;
  if ('no'.startsWith(value)) return false;
  return undefined;
}

interface ConfirmPromptConfig {
  message: string;
  default: boolean;
  /** The default is the answer this prompt got earlier in the action. */
  earlier: boolean;
}

const confirmPrompt = createPrompt<boolean, ConfirmPromptConfig>((config, done) => {
  const theme = makeTheme();
  const [status, setStatus] = useState<Status>('idle');
  const [value, setValue] = useState('');
  const [errorMsg, setError] = useState<string>();
  const prefix = usePrefix({ status, theme });

  useKeypress((key, rl) => {
    if (status !== 'idle') return;
    if (isEnterKey(key)) {
      const answer = yesOrNo(value, config.default);
      if (answer === undefined) {
        rl.write(value);
        setError('Answer y or n.');
        return;
      }
      setValue(answer ? 'Yes' : 'No');
      setStatus('done');
      done(answer);
    } else {
      setValue(rl.line);
      setError(undefined);
    }
  });

  const message = theme.style.message(config.message, status);
  if (status === 'done') return `${prefix} ${message} ${theme.style.answer(value)}`;
  const enter = `${config.default ? 'yes' : 'no'}${config.earlier ? ', your earlier answer' : ''}`;
  const bottom = [
    errorMsg ? theme.style.error(errorMsg) : '',
    helpTip([
      ['y/n', 'answer'],
      ['⏎', enter],
    ]),
  ]
    .filter(Boolean)
    .join('\n');
  return [`${prefix} ${message} ${theme.style.defaultAnswer(config.default ? 'Y/n' : 'y/N')} ${value}`, bottom];
});

/** A prompt's config with the id its answer is kept under, for a step back or a retry. */
type Recorded<C> = C & { id?: string };

/** A yes/no question that Esc steps back from. With an `id` the answer given earlier in the action is the default. */
export async function confirm(config: Recorded<{ message: string; default?: boolean }>): Promise<boolean> {
  const earlier = config.id === undefined ? undefined : recalledAnswer(config.id);
  const fallback = typeof earlier === 'boolean' ? earlier : config.default !== false;
  const answer = await withBack((context) =>
    confirmPrompt({ message: config.message, default: fallback, earlier: typeof earlier === 'boolean' }, context),
  );
  if (config.id !== undefined) rememberAnswer(config.id, answer);
  return answer;
}

interface InputPromptConfig {
  message: string;
  default?: string;
  validate?: (value: string) => boolean | string | Promise<boolean | string>;
}

const inputPrompt = createPrompt<string, InputPromptConfig>((config, done) => {
  const theme = makeTheme();
  const [status, setStatus] = useState<Status>('idle');
  const [value, setValue] = useState('');
  const [errorMsg, setError] = useState<string>();
  const prefix = usePrefix({ status, theme });

  useKeypress(async (key, rl) => {
    if (status !== 'idle') return;
    if (isEnterKey(key)) {
      const answer = value || config.default || '';
      setStatus('loading');
      const valid = config.validate ? await config.validate(answer) : true;
      if (valid === true) {
        setValue(answer);
        setStatus('done');
        done(answer);
        return;
      }
      rl.write(value);
      setError(typeof valid === 'string' ? valid : 'Enter a valid value.');
      setStatus('idle');
    } else if (isTabKey(key) && !value && config.default) {
      rl.clearLine(0);
      rl.write(config.default);
      setValue(config.default);
    } else {
      setValue(rl.line);
      setError(undefined);
    }
  });

  const message = theme.style.message(config.message, status);
  if (status === 'done') return `${prefix} ${message} ${theme.style.answer(value)}`;
  const shownDefault = config.default && !value ? theme.style.defaultAnswer(config.default) : undefined;
  const keys: Array<[string, string]> = [['⏎', 'submit'], ...(config.default ? [['tab', 'edit the default'] as [string, string]] : [])];
  const bottom = [errorMsg ? theme.style.error(errorMsg) : '', helpTip(keys)].filter(Boolean).join('\n');
  return [[prefix, message, shownDefault, value].filter((part) => part !== undefined).join(' '), bottom];
});

/** A line of text that Esc steps back from. With an `id` the answer given earlier in the action is the default. */
export async function input(config: Recorded<InputPromptConfig>): Promise<string> {
  const earlier = config.id === undefined ? undefined : recalledAnswer(config.id);
  const answer = await withBack((context) =>
    inputPrompt({ message: config.message, default: typeof earlier === 'string' ? earlier : config.default, validate: config.validate }, context),
  );
  if (config.id !== undefined) rememberAnswer(config.id, answer);
  return answer;
}

/** Inquirer's select, which Esc steps back from and whose help line says so. */
export function select<T>(config: Parameters<typeof inquirerSelect<T>>[0]): Promise<T> {
  return withBack((context) =>
    inquirerSelect<T>({ ...config, theme: { style: { keysHelpTip: (keys: Array<[string, string]>) => helpTip(keys) } } }, context),
  );
}
