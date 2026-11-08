import { describe, expect, it } from 'vitest';
import { classifyRun, type FailureClass } from './failure-class';
import type { RunRecord } from './run-record';

const failed = (over: Partial<RunRecord>): RunRecord => ({
  run: '20261108T120000Z-aaaaaaaaaa',
  environment: 'production',
  target: 'a'.repeat(40),
  startedAt: '2026-11-08T12:00:00.000Z',
  endedAt: '2026-11-08T12:06:00.000Z',
  outcome: 'failed',
  steps: [],
  ...over,
});

const SERVERS = 'https://api.scaleway.com/instance/v1/zones/fr-par-2/servers';

// One record per rule, in the order the rules decide: a record that two rules match proves the earlier one wins.
const cases: [string, RunRecord, Pick<FailureClass, 'side' | 'retryLikely'>, string][] = [
  [
    'a missing value',
    failed({ outcome: 'blocked', failedStep: 'Check runtime secrets', error: 'Blocked: required runtime values are not set: RESEND_API_KEY' }),
    { side: 'settings', retryLikely: false },
    'A value is missing',
  ],
  [
    'an apply owed',
    failed({ outcome: 'apply needed', failedStep: 'Check the description', error: 'apply needed: the description changed' }),
    { side: 'settings', retryLikely: false },
    'waits for your go',
  ],
  [
    "a 5xx of Scaleway's API, though a machine left no account",
    failed({ failedStep: 'Switch machines', error: `Scaleway POST ${SERVERS} → 503: {"message":"unavailable"}`, boot: [{ service: 'backend' }] }),
    { side: 'platform', retryLikely: true },
    `Scaleway's API failed (503) during "Switch machines"`,
  ],
  [
    'a machine type out of stock',
    failed({ failedStep: 'Switch machines', error: `Scaleway POST ${SERVERS} → 412: {"type":"precondition_failed","message":"Out of stock"}` }),
    { side: 'platform', retryLikely: true },
    '("Out of stock")',
  ],
  [
    'a download link that expired before the machine fetched it, though its boot failed',
    failed({
      failedStep: 'Switch machines',
      error: 'backend never became healthy: fetch-env answered 403',
      boot: [{ service: 'backend', key: 'backend-20261108T120300Z-boot.log', failed: true }],
    }),
    { side: 'platform', retryLikely: true },
    'download links',
  ],
  [
    'a failed build',
    failed({ failedStep: 'Build the release', error: 'build-release exited 1' }),
    { side: 'release', retryLikely: false },
    "builder's report",
  ],
  [
    'a crash at boot',
    failed({
      failedStep: 'Switch machines',
      error: 'backend never became healthy',
      boot: [{ service: 'backend', key: 'backend-20261108T120300Z-boot.log', failed: true }, { service: 'cdc' }],
    }),
    { side: 'release', retryLikely: false },
    'The new backend machine crashed at boot',
  ],
  [
    'a machine that left no account',
    failed({ failedStep: 'Switch machines', error: 'cdc never became healthy', boot: [{ service: 'cdc' }] }),
    { side: 'unknown', retryLikely: false },
    'The new cdc machine never answered the health check',
  ],
  [
    'failed smoke tests',
    failed({ failedStep: 'Smoke tests', error: 'smoke: /api/health answered 502' }),
    { side: 'release', retryLikely: false },
    'the smoke tests failed',
  ],
  [
    'anything else',
    failed({ failedStep: 'Acquire the lease', error: 'the lease is held by run 20261108T115900Z-bbbbbbbbbb' }),
    { side: 'unknown', retryLikely: false },
    'the lease is held by run',
  ],
];

describe('a run that did not deploy', () => {
  it.each(cases)('is classed by its first matching rule: %s', (_, record, expected, words) => {
    const verdict = classifyRun(record);
    expect({ side: verdict.side, retryLikely: verdict.retryLikely }).toEqual(expected);
    expect(verdict.sentence).toContain(words);
  });
});
