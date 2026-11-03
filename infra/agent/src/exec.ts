import { spawn } from 'node:child_process';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  /** Set when `timeoutMs` ran out and the child was killed; `code` is then 124, as GNU `timeout` reports it. */
  timedOut?: boolean;
}

export interface ExecOptions {
  cwd?: string;
  input?: string;
  /** Kill the child's process group (SIGTERM, then SIGKILL after {@link killGraceMs}) once it runs this long. Absent = no limit. */
  timeoutMs?: number;
  /** Receives each output line as it arrives, the last carriage-return frame of a redrawn line only; the result still carries the whole output. */
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void;
}

export type ExecFn = (command: string, args: string[], opts?: ExecOptions) => Promise<ExecResult>;

/** Time a timed-out child gets between SIGTERM and SIGKILL, and again before the result settles without its pipes closing. */
const killGraceMs = 10_000;

/** Exit code reported for a timed-out child. */
const timedOutCode = 124;

/** A partial line longer than this is cut to its tail, so a progress bar redrawn without a newline cannot grow without bound. */
const maxPendingLine = 64 * 1024;

/** Split a stream's chunks into lines for `onLine`. A thrown callback never reaches the child's handling. */
function lineSplitter(stream: 'stdout' | 'stderr', onLine: ExecOptions['onLine']): { push(chunk: string): void; end(): void } {
  let pending = '';
  const emit = (raw: string) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const frame = line.slice(line.lastIndexOf('\r') + 1).trimEnd();
    if (!frame || !onLine) return;
    try {
      onLine(frame, stream);
    } catch {
      // Streaming is best-effort.
    }
  };
  return {
    push(chunk) {
      pending += chunk;
      for (let newline = pending.indexOf('\n'); newline >= 0; newline = pending.indexOf('\n')) {
        emit(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
      if (pending.length > maxPendingLine) pending = pending.slice(-maxPendingLine);
    },
    end() {
      if (pending) emit(pending);
      pending = '';
    },
  };
}

/**
 * Run a command, streaming its output lines to `onLine` and buffering it for the result. With `timeoutMs` the child leads its own
 * process group, so the kill also reaches what it spawned (`docker compose` runs as a CLI plugin child of `docker`), and the result
 * settles even when a survivor still holds the pipes.
 */
export const execCommand: ExecFn = (command, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const limited = opts.timeoutMs !== undefined;
    const child = spawn(command, args, { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'], detached: limited });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const timers: NodeJS.Timeout[] = [];
    const lines = { stdout: lineSplitter('stdout', opts.onLine), stderr: lineSplitter('stderr', opts.onLine) };
    const settle = (result: ExecResult) => {
      if (settled) return;
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      lines.stdout.end();
      lines.stderr.end();
      resolve(result);
    };
    const killGroup = (signal: NodeJS.Signals) => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, signal);
      } catch {
        // The group is already gone.
      }
    };
    if (limited) {
      timers.push(
        setTimeout(() => {
          timedOut = true;
          killGroup('SIGTERM');
          timers.push(
            setTimeout(() => {
              killGroup('SIGKILL');
              timers.push(setTimeout(() => settle({ code: timedOutCode, stdout, stderr, timedOut }), killGraceMs));
            }, killGraceMs),
          );
        }, opts.timeoutMs),
      );
    }
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      lines.stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      lines.stderr.push(chunk);
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => settle(timedOut ? { code: timedOutCode, stdout, stderr, timedOut } : { code: code ?? 1, stdout, stderr }));
    if (opts.input) child.stdin.end(opts.input);
    else child.stdin.end();
  });

/** The last `max` characters of a command's output, stderr first: enough to name the cause without flooding a log line. */
function outputTail(result: ExecResult, max = 2000): string {
  const output = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join('\n');
  return output.length > max ? `…${output.slice(-max)}` : output;
}

export async function mustExec(exec: ExecFn, command: string, args: string[], opts?: ExecOptions): Promise<ExecResult> {
  const result = await exec(command, args, opts);
  if (result.timedOut) {
    const seconds = Math.round((opts?.timeoutMs ?? 0) / 1000);
    throw new Error(`${command} ${args.join(' ')} timed out after ${seconds}s and was killed. Output tail:\n${outputTail(result) || '(no output)'}`);
  }
  if (result.code !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit ${result.code}: ${result.stderr || result.stdout}`);
  return result;
}
