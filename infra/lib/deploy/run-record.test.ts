import { describe, expect, it } from 'vitest';
import { RunRecorder, runId, runLogKey, runRecordKey, runSummaryLine } from './run-record';

describe('a run record', () => {
  it('has an id that sorts by time and names its target', () => {
    const id = runId('21bae33f7cec7ba8fc3446a771e94e9b3f141b84', new Date('2026-10-15T00:20:05.123Z'));
    expect(id).toBe('20261015T002005Z-21bae33f7c');
    expect(runRecordKey(id)).toBe('runs/20261015T002005Z-21bae33f7c/record.json');
    expect(runLogKey(id)).toBe('runs/20261015T002005Z-21bae33f7c/log');
  });

  it('keeps the first failed step, and scrubs secret-bearing lines from its log and its error', () => {
    const recorder = new RunRecorder({ run: 'r', environment: 'staging', target: 'a'.repeat(40), now: new Date('2026-10-15T00:00:00Z') });
    recorder.step('Build the release', 120, 'ok');
    recorder.step('Waved rollout', 30, 'error');
    recorder.step('Reap', 1, 'error');
    recorder.line('DATABASE_URL=postgres://user:pw@db');
    recorder.finish('failed', 'boot failed: SECRET_KEY=abc', new Date('2026-10-15T00:02:31Z'));
    const record = recorder.record();
    expect(record.failedStep).toBe('Waved rollout');
    expect(record.error).not.toContain('abc');
    expect(recorder.log()).not.toContain('postgres://');
    expect(runSummaryLine(record)).toBe('2026-10-15 00:00  staging  aaaaaaaaaa  failed at "Waved rollout" in 2m31s');
  });
});
