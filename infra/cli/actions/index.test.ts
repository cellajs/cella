import { stripVTControlCharacters } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPERATOR_ACTIONS, type OperatorActionId } from '../../lib/operator-actions';
import { PromptBack } from '../prompts/back';
import { forgetSession, startMenuSession } from '../session';
import { endAction, type InfraContext } from '../shared';
import { ACTION_RUNNERS, runAction } from './index';

const context = {} as InfraContext;

type Runner = (context: InfraContext) => Promise<void>;

/** A dispatch table where every action is `runner`, so a test exercises the dispatch without a real action. */
function runnersOf(runner: Runner): Record<OperatorActionId, Runner> {
  return Object.fromEntries(Object.keys(OPERATOR_ACTIONS).map((id) => [id, runner])) as Record<OperatorActionId, Runner>;
}

afterEach(() => {
  vi.unstubAllEnvs();
  forgetSession();
});

describe('ACTION_RUNNERS', () => {
  it('has a function for every action of the table and nothing else', () => {
    expect(Object.keys(ACTION_RUNNERS).sort()).toEqual(Object.keys(OPERATOR_ACTIONS).sort());
    for (const runner of Object.values(ACTION_RUNNERS)) expect(runner).toBeTypeOf('function');
  });
});

describe('runAction', () => {
  it('resolves to 0 when the action runs to its end', async () => {
    const runner = vi.fn(async () => {});
    await expect(runAction('status', context, { runners: runnersOf(runner) })).resolves.toEqual({ code: 0 });
    expect(runner).toHaveBeenCalledWith(context);
  });

  it('resolves to the code an action ended itself with, and prints nothing more', async () => {
    const log = vi.fn();
    await expect(runAction('apply', context, { runners: runnersOf(async () => endAction(2)), log })).resolves.toEqual({ code: 2 });
    await expect(runAction('apply', context, { runners: runnersOf(async () => endAction(0)), log })).resolves.toEqual({ code: 0 });
    expect(log).not.toHaveBeenCalled();
  });

  it('reports a failure the action did not expect in one line, names the file that keeps its stack, and resolves to 1', async () => {
    const lines: string[] = [];
    const broken = runnersOf(async () => {
      throw new Error('AccessDenied: the state bucket refused this key');
    });
    const keep = vi.fn(() => '/infra/.debug/unlock.stack.txt');
    await expect(runAction('unlock', context, { runners: broken, keep, log: (line) => lines.push(stripVTControlCharacters(line)) })).resolves.toEqual(
      { code: 1 },
    );
    expect(lines[0]).toContain('Unlock failed: AccessDenied: the state bucket refused this key');
    expect(lines[1]).toContain('/infra/.debug/unlock.stack.txt');
    expect(lines).toHaveLength(2);
    expect(keep).toHaveBeenCalledWith('unlock', expect.any(Error));
  });

  it('lets a Ctrl-C at a prompt through to the handler that ends the run', async () => {
    const log = vi.fn();
    const aborted = runnersOf(async () => {
      const error = new Error('User force closed the prompt with SIGINT');
      error.name = 'ExitPromptError';
      throw error;
    });
    await expect(runAction('apply', context, { runners: aborted, log })).rejects.toMatchObject({ name: 'ExitPromptError' });
    expect(log).not.toHaveBeenCalled();
  });

  it('names the fix of a single-action run as its command', async () => {
    const lines: string[] = [];
    const held = runnersOf(async () => endAction(1, { fix: 'unlock' }));
    await expect(runAction('apply', context, { runners: held, log: (line) => lines.push(stripVTControlCharacters(line)) })).resolves.toEqual({
      code: 1,
    });
    expect(lines).toEqual(['  Unlock: pnpm cella infra unlock']);
  });
});

describe('runAction in a menu session', () => {
  it('must not drop the operator back in the shell on a failure: it offers a retry, the fix by its menu name, and the menu', async () => {
    startMenuSession();
    const runner = vi.fn(async () => endAction(1, { fix: 'unlock' }));
    const choose = vi.fn().mockResolvedValueOnce('retry').mockResolvedValueOnce('unlock');

    await expect(runAction('apply', context, { runners: runnersOf(runner), choose })).resolves.toEqual({ code: 1, next: 'unlock' });
    expect(runner).toHaveBeenCalledTimes(2);
    expect(choose.mock.calls[0]?.[0].map((row: { label: string }) => row.label)).toEqual([
      'Retry Review & apply changes',
      'Unlock',
      '← Back to menu',
    ]);
  });

  it('returns to the menu on a Ctrl-C or an Esc at a prompt, and offers nothing', async () => {
    startMenuSession();
    const choose = vi.fn();
    const lines: string[] = [];
    const aborted = runnersOf(async () => {
      const error = new Error('User force closed the prompt with SIGINT');
      error.name = 'ExitPromptError';
      throw error;
    });
    await expect(
      runAction('apply', context, { runners: aborted, choose, log: (line) => lines.push(stripVTControlCharacters(line)) }),
    ).resolves.toEqual({
      code: 130,
    });
    expect(lines).toEqual(['Back to the menu.']);
    await expect(
      runAction('apply', context, {
        runners: runnersOf(async () => {
          throw new PromptBack();
        }),
        choose,
      }),
    ).resolves.toEqual({ code: 0, back: true });
    expect(choose).not.toHaveBeenCalled();
  });
});
