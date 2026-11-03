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

// A deploy's versions: written at the start, after each step and at the end.
const honest: StoredVersion<RunRecord>[] = [
  { at: '2026-10-15T00:00:00.000Z', body: base },
  { at: '2026-10-15T00:02:00.000Z', body: { ...base, steps: [{ title: 'Build the release', seconds: 120, outcome: 'ok' }] } },
  {
    at: '2026-10-15T00:05:00.000Z',
    body: {
      ...base,
      steps: [
        { title: 'Build the release', seconds: 120, outcome: 'ok' },
        { title: 'Waved rollout', seconds: 180, outcome: 'error' },
      ],
      failedStep: 'Waved rollout',
      boot: [{ service: 'backend', key: 'backend-20261015T000400Z-boot.log', failed: true }],
    },
  },
  {
    at: '2026-10-15T00:05:01.000Z',
    body: {
      ...base,
      steps: [
        { title: 'Build the release', seconds: 120, outcome: 'ok' },
        { title: 'Waved rollout', seconds: 180, outcome: 'error' },
      ],
      failedStep: 'Waved rollout',
      boot: [{ service: 'backend', key: 'backend-20261015T000400Z-boot.log', failed: true }],
      outcome: 'failed',
      endedAt: '2026-10-15T00:05:01.000Z',
      error: 'cutover failed',
    },
  },
];

describe('a run record read by its first version', () => {
  it('reads a deploy that only grew its record as its newest version', () => {
    expect(readByGrowth(honest, recordGrows)).toEqual({ newest: honest[3]?.body });
  });

  it('must not let a key that may write the bucket turn a failed run into a deployed one: the version is named, the run shown as it stood', () => {
    const forged: RunRecord = {
      ...base,
      steps: [
        { title: 'Build the release', seconds: 120, outcome: 'ok' },
        { title: 'Waved rollout', seconds: 180, outcome: 'ok' },
      ],
      outcome: 'deployed',
      endedAt: '2026-10-15T00:05:01.000Z',
    };
    const reading = readByGrowth([...honest, { at: '2026-10-15T03:00:00.000Z', body: forged }], recordGrows);
    expect(reading?.newest).toEqual(honest[3]?.body);
    expect(reading?.rewrite).toEqual({ at: '2026-10-15T03:00:00.000Z', detail: 'changed step "Waved rollout"' });
  });

  it('names a version that changes the end, drops a step, replaces the target or deletes the record, and ignores what follows it', () => {
    const ended = honest[3]?.body as RunRecord;
    const cases: [StoredVersion<RunRecord>, string][] = [
      [{ at: '2026-10-15T03:00:00.000Z', body: { ...ended, outcome: 'deployed', error: undefined } }, 'changed the outcome from failed to deployed'],
      [{ at: '2026-10-15T03:00:00.000Z', body: { ...ended, steps: ended.steps.slice(0, 1) } }, 'dropped step "Waved rollout"'],
      [{ at: '2026-10-15T03:00:00.000Z', body: { ...ended, target: 'c'.repeat(40) } }, 'changed target'],
      [{ at: '2026-10-15T03:00:00.000Z' }, 'deleted the record'],
    ];
    for (const [version, detail] of cases) {
      const reading = readByGrowth([...honest, version, { at: '2026-10-15T04:00:00.000Z', body: ended }], recordGrows);
      expect(reading?.newest, detail).toEqual(ended);
      expect(reading?.rewrite, detail).toEqual({ at: '2026-10-15T03:00:00.000Z', detail });
    }
  });

  it('reads a log by the same rule: a version that is not the one before plus more lines is a rewrite', () => {
    const grown = [
      { at: '2026-10-15T00:00:00.000Z', body: '[deploy] run x\n' },
      { at: '2026-10-15T00:02:00.000Z', body: '[deploy] run x\n[deploy] Build the release: ok\n' },
    ];
    expect(readByGrowth(grown, logGrows)).toEqual({ newest: grown[1]?.body });
    const shortened = [...grown, { at: '2026-10-15T03:00:00.000Z', body: '[deploy] run x\n[deploy] Build the release: failed\n' }];
    expect(readByGrowth(shortened, logGrows)).toEqual({
      newest: grown[1]?.body,
      rewrite: { at: '2026-10-15T03:00:00.000Z', detail: 'changed the log' },
    });
  });
});
