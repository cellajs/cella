import { describe, expect, it } from 'vitest';
import {
  logGrows,
  type RunRecord,
  RunRecorder,
  readByGrowth,
  recordGrows,
  runId,
  runLogKey,
  runRecordKey,
  runSummaryLine,
  type StoredVersion,
} from './run-record';

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

const base: RunRecord = {
  run: '20261015T000000Z-bbbbbbbbbb',
  environment: 'staging',
  target: 'b'.repeat(40),
  startedAt: '2026-10-15T00:00:00.000Z',
  outcome: 'running',
  steps: [],
};
const steps: RunRecord['steps'] = [
  { title: 'Build the release', seconds: 120, outcome: 'ok' },
  { title: 'Waved rollout', seconds: 180, outcome: 'error' },
];
const boot = [{ service: 'backend', key: 'backend-20261015T000400Z-boot.log', failed: true }];
// A deploy's versions: written at the start, after each step and at the end.
const started: StoredVersion<RunRecord> = { at: '2026-10-15T00:00:00.000Z', body: base };
const built: StoredVersion<RunRecord> = { at: '2026-10-15T00:02:00.000Z', body: { ...base, steps: steps.slice(0, 1) } };
const failing: RunRecord = { ...base, steps, failedStep: 'Waved rollout', boot };
const rolledOut: StoredVersion<RunRecord> = { at: '2026-10-15T00:05:00.000Z', body: failing };
const ended: RunRecord = { ...failing, outcome: 'failed', endedAt: '2026-10-15T00:05:01.000Z', error: 'a switch failed' };
const finished: StoredVersion<RunRecord> = { at: '2026-10-15T00:05:01.000Z', body: ended };
const honest = [started, built, rolledOut, finished];
const later = '2026-10-15T03:00:00.000Z';

describe('a run record read by its first version', () => {
  it('reads a deploy that only grew its record as its newest version', async () => {
    expect(await readByGrowth(honest, recordGrows, 'the record')).toEqual({ newest: ended });
  });

  it('must not let a key that may write the bucket turn a failed run into a deployed one: the version is named, the run shown as it stood', async () => {
    const forged: RunRecord = { ...base, steps: steps.map((step) => ({ ...step, outcome: 'ok' })), outcome: 'deployed', endedAt: later };
    // While the run was still open, the forged version changes a step; after the end, nothing but the same record again grows it.
    expect(await readByGrowth([started, built, rolledOut, { at: later, body: forged }], recordGrows, 'the record')).toEqual({
      newest: failing,
      rewrite: { at: later, detail: 'changed step "Waved rollout"' },
    });
    expect(await readByGrowth([...honest, { at: later, body: forged }], recordGrows, 'the record')).toEqual({
      newest: ended,
      rewrite: { at: later, detail: 'changed the record after its end' },
    });
    expect(await readByGrowth([...honest, { at: later, body: { ...ended, boot: [] } }], recordGrows, 'the record')).toEqual({
      newest: ended,
      rewrite: { at: later, detail: 'changed the record after its end' },
    });
  });

  it('names a version that drops a step, replaces the target, is no record or deletes the record, and reads no version after it', async () => {
    const cases: [StoredVersion<RunRecord>, string][] = [
      [{ at: later, body: { ...failing, steps: steps.slice(0, 1) } }, 'dropped step "Waved rollout"'],
      [{ at: later, body: { ...failing, target: 'c'.repeat(40) } }, 'changed target'],
      [{ at: later, fault: 'is not a record' }, 'is not a record'],
      [{ at: later }, 'deleted the record'],
    ];
    for (const [version, detail] of cases) {
      let read = 0;
      const versions = (async function* () {
        for (const each of [started, built, rolledOut, version, finished]) {
          read++;
          yield each;
        }
      })();
      expect(await readByGrowth(versions, recordGrows, 'the record'), detail).toEqual({ newest: failing, rewrite: { at: later, detail } });
      expect(read, detail).toBe(4);
    }
  });

  it('reads a log by the same rule: a version that is not the one before plus more lines, or a deletion, is a rewrite', async () => {
    const grown = [
      { at: '2026-10-15T00:00:00.000Z', body: '[deploy] run x\n' },
      { at: '2026-10-15T00:02:00.000Z', body: '[deploy] run x\n[deploy] Build the release: ok\n' },
    ];
    expect(await readByGrowth(grown, logGrows, 'the log')).toEqual({ newest: grown[1]?.body });
    const shortened = { at: later, body: '[deploy] run x\n[deploy] Build the release: failed\n' };
    expect(await readByGrowth([...grown, shortened], logGrows, 'the log')).toEqual({
      newest: grown[1]?.body,
      rewrite: { at: later, detail: 'changed the log' },
    });
    expect(await readByGrowth([...grown, { at: later }], logGrows, 'the log')).toEqual({
      newest: grown[1]?.body,
      rewrite: { at: later, detail: 'deleted the log' },
    });
  });
});
