import { stripVTControlCharacters } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPERATOR_ACTIONS, type OperatorActionId } from '../../lib/operator-actions';
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
    await expect(runAction('status', context, runnersOf(runner))).resolves.toBe(0);
    expect(runner).toHaveBeenCalledWith(context);
  });

  it('resolves to the code an action ended itself with, and prints nothing more', async () => {
    const log = vi.fn();
    await expect(
      runAction(
        'apply',
        context,
        runnersOf(async () => endAction(2)),
        log,
      ),
    ).resolves.toBe(2);
    await expect(
      runAction(
        'apply',
        context,
        runnersOf(async () => endAction(0)),
        log,
      ),
    ).resolves.toBe(0);
    expect(log).not.toHaveBeenCalled();
  });

  it('reports a failure the action did not expect in one line and resolves to 1', async () => {
    vi.stubEnv('INFRA_DEBUG', undefined);
    const lines: string[] = [];
    const broken = runnersOf(async () => {
      throw new Error('AccessDenied: the state bucket refused this key');
    });
    await expect(runAction('unlock', context, broken, (line) => lines.push(stripVTControlCharacters(line)))).resolves.toBe(1);
    expect(lines[0]).toContain('Unlock stack failed: AccessDenied: the state bucket refused this key');
    expect(lines[1]).toContain('INFRA_DEBUG=1');
    expect(lines).toHaveLength(2);
  });

  it('prints the stack trace of an unexpected failure with INFRA_DEBUG=1', async () => {
    vi.stubEnv('INFRA_DEBUG', '1');
    const lines: string[] = [];
    const broken = runnersOf(async () => {
      throw new Error('boom');
    });
    await runAction('unlock', context, broken, (line) => lines.push(stripVTControlCharacters(line)));
    expect(lines[1]).toContain('Error: boom');
    expect(lines[1]).toContain('index.test.ts');
  });

  it('lets a Ctrl-C at a prompt through to the handler that ends the run', async () => {
    const log = vi.fn();
    const aborted = runnersOf(async () => {
      const error = new Error('User force closed the prompt with SIGINT');
      error.name = 'ExitPromptError';
      throw error;
    });
    await expect(runAction('apply', context, aborted, log)).rejects.toMatchObject({ name: 'ExitPromptError' });
    expect(log).not.toHaveBeenCalled();
  });
});
