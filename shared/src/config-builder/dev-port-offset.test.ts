import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimSlot, resolveDevPortOffset, shiftLocalPort } from './dev-port-offset.ts';

describe('shiftLocalPort', () => {
  it('moves the port of a localhost URL and keeps the rest', () => {
    expect(shiftLocalPort('http://localhost:3000/api/auth', 100)).toBe('http://localhost:3100/api/auth');
    expect(shiftLocalPort('ws://localhost:3000/yjs', 200)).toBe('ws://localhost:3200/yjs');
    expect(shiftLocalPort('http://localhost:3100', -100)).toBe('http://localhost:3000');
  });

  it('leaves a public URL and a portless URL unchanged', () => {
    expect(shiftLocalPort('https://app.example.com/api', 100)).toBe('https://app.example.com/api');
    expect(shiftLocalPort('http://localhost/api', 100)).toBe('http://localhost/api');
  });
});

describe('claimSlot', () => {
  let dir: string;
  /** A worktree that exists on disk, as its git directory path. */
  const worktree = (name: string) => {
    const gitDir = path.join(dir, 'worktrees', name);
    fs.mkdirSync(gitDir, { recursive: true });
    return gitDir;
  };
  const claim = (owner: string) => claimSlot(fs, path.join(dir, 'slots'), owner);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-port-slots-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('gives each worktree its own slot and the same one on the next run', () => {
    const [a, b] = [worktree('a'), worktree('b')];
    expect(claim(a)).toBe(1);
    expect(claim(b)).toBe(2);
    expect(claim(a)).toBe(1);
    expect(claim(b)).toBe(2);
  });

  it('reuses the slot of a removed worktree', () => {
    const [a, b] = [worktree('a'), worktree('b')];
    claim(a);
    claim(b);
    fs.rmSync(a, { recursive: true });
    expect(claim(worktree('c'))).toBe(1);
  });

  it('takes the slot whose stack started longest ago once all nine are held', () => {
    const owners = Array.from({ length: 9 }, (_, index) => worktree(`w${index}`));
    for (const owner of owners) claim(owner);
    // Slot 4 started first, every other slot a minute later.
    for (let slot = 1; slot <= 9; slot++) {
      const startedAt = new Date(slot === 4 ? 1_000_000 : 1_060_000);
      fs.utimesSync(path.join(dir, 'slots', String(slot)), startedAt, startedAt);
    }
    const latecomer = worktree('late');
    expect(claim(latecomer)).toBe(4);
    // The previous holder of slot 4 claims another slot at its next start.
    expect(claim(owners[3])).not.toBe(4);
    expect(claim(latecomer)).toBe(4);
  });
});

describe('resolveDevPortOffset', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('takes DEV_PORT_OFFSET as given, 0 included', () => {
    vi.stubEnv('DEV_PORT_OFFSET', '900');
    expect(resolveDevPortOffset()).toBe(900);
    vi.stubEnv('DEV_PORT_OFFSET', '0');
    expect(resolveDevPortOffset()).toBe(0);
  });

  it('refuses a value that is not a whole number of ports', () => {
    vi.stubEnv('DEV_PORT_OFFSET', 'abc');
    expect(() => resolveDevPortOffset()).toThrow('Invalid DEV_PORT_OFFSET');
    vi.stubEnv('DEV_PORT_OFFSET', '-100');
    expect(() => resolveDevPortOffset()).toThrow('Invalid DEV_PORT_OFFSET');
  });
});
