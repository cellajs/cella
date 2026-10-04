import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { endOnPromptAbort, isPromptAbort } from './abort';

/** The rejection Inquirer raises for a Ctrl-C at a prompt. */
function promptAbort(): Error {
  const error = new Error('User force closed the prompt with SIGINT');
  error.name = 'ExitPromptError';
  return error;
}

describe('isPromptAbort', () => {
  it('recognises a Ctrl-C at a prompt', () => {
    expect(isPromptAbort(promptAbort())).toBe(true);
  });

  it('leaves every other failure alone', () => {
    const escaped = new Error('Prompt was aborted');
    escaped.name = 'AbortPromptError';
    expect(isPromptAbort(escaped)).toBe(false);
    expect(isPromptAbort(new Error('pulumi up exited 255'))).toBe(false);
    expect(isPromptAbort('ExitPromptError')).toBe(false);
    expect(isPromptAbort(undefined)).toBe(false);
  });
});

describe('endOnPromptAbort', () => {
  /** Run the abort with recorded effects; the returned list is what happened, in order. */
  function run(state: { isTerminal: boolean; leaseHeld: boolean }): string[] {
    const order: string[] = [];
    endOnPromptAbort({
      ...state,
      log: vi.fn((line: string) => order.push(`log:${stripVTControlCharacters(line).trim().split('\n')[0]}`)),
      interrupt: vi.fn(() => order.push('interrupt')),
      exit: vi.fn((code: number) => order.push(`exit:${code}`)),
    });
    return order;
  }

  it('leaves with one line and exit 0 when the operator presses Ctrl-C at a prompt', () => {
    expect(run({ isTerminal: true, leaseHeld: false })).toEqual(['log:Cancelled.', 'exit:0']);
  });

  it('raises the interrupt while a stack lease is held, so the lock releases before the process ends', () => {
    expect(run({ isTerminal: true, leaseHeld: true })).toEqual(['log:Cancelled.', 'interrupt']);
  });

  it('fails the run when a prompt had no terminal to ask on', () => {
    expect(run({ isTerminal: false, leaseHeld: false })).toEqual([
      'log:✖ A prompt needed an answer and this run has no terminal to ask on.',
      'exit:1',
    ]);
    expect(run({ isTerminal: false, leaseHeld: true }).at(-1)).toBe('exit:1');
  });
});
