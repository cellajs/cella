import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

export interface LockInfo {
  pid: number;
  scenario: string;
  startedAt: string;
  target: string;
}

/**
 * Where runs keep baselines, logs and locks: `cella-bench/` in the git common dir, which every worktree of a clone
 * shares and git never shows; `.bench/` in `cwd` outside a repository.
 */
export function benchDataDir(cwd: string): string {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return join(common.trim(), 'cella-bench');
  } catch {
    return resolve(cwd, '.bench');
  }
}

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

const readLock = (file: string): LockInfo | null => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as LockInfo;
  } catch {
    return null;
  }
};

export interface Lock {
  /** Names the scenario now running, for a run that waits on this one. */
  update(scenario: string): void;
  release(): void;
  /** Bench runs of this clone that target another stack: they share the machine. */
  others: LockInfo[];
}

/**
 * Claims the stack at `target` for this process, so two runs never measure one stack at once. A lock whose process
 * has exited is taken over. Released on exit.
 * @returns The lock, or the live run that holds it.
 */
export function acquireLock(dataDir: string, target: string, scenario: string): { lock: Lock } | { holder: LockInfo } {
  const dir = join(dataDir, 'locks');
  mkdirSync(dir, { recursive: true });
  const { host } = new URL(target);
  const file = join(dir, `${host.replace(/[^a-z0-9.-]/gi, '_')}.json`);
  const info: LockInfo = { pid: process.pid, scenario, startedAt: new Date().toISOString(), target };

  for (let attempt = 0; ; attempt++) {
    try {
      writeFileSync(file, JSON.stringify(info), { flag: 'wx' });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt > 2) throw error;
      const holder = readLock(file);
      if (holder && isAlive(holder.pid)) return { holder };
      try {
        unlinkSync(file);
      } catch {}
    }
  }

  const release = () => {
    if (readLock(file)?.pid !== process.pid) return;
    try {
      unlinkSync(file);
    } catch {}
  };
  process.once('exit', release);
  const others = readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((path) => path !== file)
    .flatMap((path) => readLock(path) ?? [])
    .filter((other) => isAlive(other.pid));

  return {
    lock: {
      update: (name) => writeFileSync(file, JSON.stringify({ ...info, scenario: name })),
      release,
      others,
    },
  };
}
