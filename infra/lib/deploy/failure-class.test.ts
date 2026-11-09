import { describe, expect, it } from 'vitest';
import { blockedValues, classifyRun, type FailureClass } from './failure-class';
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
    'Waiting for RESEND_API_KEY',
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
    'a quota of the account reached, which no retry clears',
    failed({
      failedStep: 'Switch machines',
      error: `Scaleway POST ${SERVERS} → 403: {"type":"quotas_exceeded","message":"Quota exceeded for this resource"}`,
    }),
    { side: 'platform', retryLikely: false },
    'quota for that machine type is reached',
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

const advice = 'Store an operator value with `pnpm infra secrets`, which starts this target again; a generated value is made by `pnpm infra apply`.';

describe('blockedValues', () => {
  it.each([
    ['one name without its secret', 'Blocked: required runtime values are not set: RESEND_API_KEY', ['RESEND_API_KEY']],
    [
      "compose-env's message, the advice after it left out",
      `Blocked: required runtime values are not set: ADMIN_EMAIL [admin-email], BREVO_API_KEY [brevo-api-key]. ${advice}`,
      ['ADMIN_EMAIL', 'BREVO_API_KEY'],
    ],
    [
      'a missing value beside a malformed one',
      `Blocked: required runtime values are not set: ADMIN_EMAIL [admin-email]; values are not one line: X [x]. ${advice}`,
      ['ADMIN_EMAIL'],
    ],
    ['a malformed value alone', `Blocked: values are not one line: X [x]. ${advice}`, []],
    ['no error', undefined, []],
  ])('%s', (_, error, names) => {
    expect(blockedValues(error)).toEqual(names);
  });
});

describe('a run that did not deploy', () => {
  it.each(cases)('is classed by its first matching rule: %s', (_, record, expected, words) => {
    const verdict = classifyRun(record);
    expect({ side: verdict.side, retryLikely: verdict.retryLikely }).toEqual(expected);
    expect(verdict.sentence).toContain(words);
  });
});
