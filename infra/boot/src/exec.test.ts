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

describe('mustExec', () => {
  it('names the timeout and keeps the output tail', async () => {
    await expect(mustExec(execCommand, 'sh', ['-c', 'echo "[migrate] Running migrations..."; sleep 30'], { timeoutMs: 200 })).rejects.toThrow(
      /timed out after 0s and was killed\. Output tail:\n\[migrate\] Running migrations\.\.\./,
    );
  });
});
