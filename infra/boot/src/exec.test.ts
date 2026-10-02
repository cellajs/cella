import { describe, expect, it } from 'vitest';
import { execCommand, mustExec } from './exec';

describe('execCommand', () => {
  it('returns the exit code and output of a finished command', async () => {
    const result = await execCommand('sh', ['-c', 'echo out; echo err >&2; exit 3']);
    expect(result).toEqual({ code: 3, stdout: 'out\n', stderr: 'err\n' });
  });

  it('kills the whole process group once the timeout runs out', async () => {
    const startedAt = Date.now();
    // The shell's own child holds the pipes too: only a group kill lets the result settle promptly.
    const result = await execCommand('sh', ['-c', 'echo started; sleep 30; echo never'], { timeoutMs: 200 });
    expect(result.timedOut).toBe(true);
    expect(result.code).toBe(124);
    expect(result.stdout).toBe('started\n');
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });
});

describe('execCommand streaming', () => {
  it('hands over each line as it arrives, keeps the last frame of a redrawn line, and still returns the whole output', async () => {
    const lines: Array<[string, string]> = [];
    const script = "printf 'first\\nprogress 10%%\\rprogress 90%%\\rdone\\r\\n'; printf 'oops\\n' >&2; printf 'no newline'";
    const result = await execCommand('sh', ['-c', script], { onLine: (line, stream) => lines.push([stream, line]) });
    // The two pipes may interleave either way, so each stream is checked on its own.
    expect(lines.filter(([stream]) => stream === 'stdout').map(([, line]) => line)).toEqual(['first', 'done', 'no newline']);
    expect(lines.filter(([stream]) => stream === 'stderr').map(([, line]) => line)).toEqual(['oops']);
    expect(result.stdout).toBe('first\nprogress 10%\rprogress 90%\rdone\r\nno newline');
    expect(result.stderr).toBe('oops\n');
  });

  it('keeps running when the line callback throws', async () => {
    const result = await execCommand('sh', ['-c', 'echo a; echo b'], {
      onLine: () => {
        throw new Error('sink down');
      },
    });
    expect(result).toEqual({ code: 0, stdout: 'a\nb\n', stderr: '' });
  });
});

describe('mustExec', () => {
  it('names the timeout and keeps the output tail', async () => {
    await expect(mustExec(execCommand, 'sh', ['-c', 'echo "[migrate] Running migrations..."; sleep 30'], { timeoutMs: 200 })).rejects.toThrow(
      /timed out after 0s and was killed\. Output tail:\n\[migrate\] Running migrations\.\.\./,
    );
  });
});
