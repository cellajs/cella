# @cellajs/bench

The bench package: load testing for the backend, cdc, and yjs services with a runner of its own, driven by the **bench CLI**.

### TL;DR

Bench load-tests your running development app with repeatable scenarios and seed data that can be
reset and reused. Test users are already signed in, so results focus on the endpoint under test.
A run passes on what the stack did with the load, not on how fast a laptop is: every response
accepted, every written row recorded by the CDC worker, counters still right. Latencies are saved
and compared with the previous run: read them as trends, not absolutes.

## Prerequisites

Start these first (bench checks they are reachable and exits with guidance if not):

- **Postgres** seeded with app data (`pnpm docker` + `pnpm seed`)
- **Services** running via `pnpm dev`

## Commands

| Command | Description |
| --- | --- |
| `pnpm bench` | Interactive scenario picker |
| `pnpm bench <name>` | Run one scenario non-interactively |
| `pnpm bench --all` | Run every scenario in sequence, one line each and a summary table at the end |
| `pnpm bench --all --short` | Smoke run of every scenario: one VU per role, no thresholds, no baselines |
| `pnpm bench help` | List scenarios |
| `pnpm db:seed` | Seed test data (idempotent, cleans first) |
| `pnpm db:teardown` | Remove all bench data (baselines are kept) |

Before the first scenario, bench signs in as one of its users and stops when the stack rejects the cookie, naming the cookie and the config mode it came from. One run holds a stack at a time: a second `pnpm bench` against the same stack stops and names the run that holds it (process, scenario, start time).

## Scenarios

Each scenario asks one question of the stack. A scenario is a TypeScript module in `scenarios/`, and its `description` is what `pnpm bench help` lists.

| Scenario | What it answers | Checked after the run |
| --- | --- | --- |
| `get-me` | What the guard chain alone costs: the cheapest signed-in request, repeated | Responses |
| `page-load` | How the read path holds when every visitor also reads data, a product list included | Responses |
| `attachment-edit` | How many edits per second the write path takes | Responses, one activity per edit |
| `attachment-churn` | Whether creating and deleting rows in batches keeps the books right | Responses, one activity per row, the attachment count |
| `sse-fanout` | Whether every subscriber of an organization hears of a change and can fetch it | Responses, one activity per edit, notifications and range fetches counted, no stream errors |
| `yjs-typing` | How the Yjs relay holds under people typing together | Documents converged, saved and written to their rows |

## Writing a scenario

A scenario declares its load as phases and what one virtual user (VU) does. New VUs arrive on schedule whether or not earlier ones are done, as visitors do.

```ts
import { attachmentEdit } from '../src/attachment-requests';
import { benchUser } from '../src/bench-user';
import { defineScenario } from '../src/runner';

export default defineScenario({
  description: 'Attachment edit: the write path under a step-up, one rename per request.',
  phases: [
    { name: 'hold 25', duration: 10, arrivalRate: 25 },
    { name: 'hold 50', duration: 10, arrivalRate: 50 },
  ],
  counters: ['bench.rows_written'],
  checks: { maxErrorRate: 1, thresholds: { 'http.response_time.p95': 3000 } },
  async vu(vu) {
    const { cookie, userIndex } = benchUser(vu.index);
    for (let i = 0; i < 20; i++) {
      const { path, json } = attachmentEdit(userIndex);
      const res = await vu.http.put(path, { json, headers: { cookie }, name: 'PUT /attachments/:id' });
      if (res.status === 200) vu.counter('bench.rows_written');
      await vu.think(50);
    }
  },
});
```

- **Phases** start `arrivalRate` VUs per second for `duration` seconds (`rampTo` ramps the rate), or `arrivalCount` VUs spread over the duration.
- **What a VU does** is `vu`, or `roles` for a mix of VUs (`sse-fanout` runs nine subscribers to one writer), or `run` for a scenario that drives its own clients once (`yjs-typing`).
- **The VU** gets `vu.http` (one keep-alive connection per VU), `vu.sse` for an event stream, `vu.ws`, `vu.think`, and `vu.counter` and `vu.histogram` for numbers of its own. `vu.index` numbers the VUs from 0: `benchUser(vu.index)` hands each one a seeded user. `vu.short` is set during `--short`. A VU that throws counts as failed, under `errors.<code>`.
- **Names are typed.** `counters` and `histograms` list every name the scenario records, and `vu.counter`, `expect` and `forbid` accept only those, so a misspelled name fails `pnpm check`. Give a request with ids in its path a `name`, so the endpoint table has one row for it.

## Checks

A run fails, and is neither compared nor saved, when one of these fails:

- **Responses.** More than `maxRejectedShare` percent (1 by default) of the responses are not 2xx, also with `--short`: the latency of a 401 says nothing about the endpoint.
- **VU failures.** `maxErrorRate`: the share of VUs that did not complete.
- **Thresholds.** `thresholds` caps any recorded latency, such as `'http.response_time.p95': 3000` or `'yjs.peer_latency_ms.p95': 50`. `--short` skips them.
- **Counters.** `expect` names counters that must have counted, `forbid` counters that must stay at zero. `sse-fanout` expects notifications, so subscribers that hear nothing fail the run. `--short` asks only for what is forbidden: each role plays once.
- **Activities.** A scenario counts the rows its requests wrote as `bench.rows_written`. After the run the CLI waits for the CDC worker, for at most 60 seconds, and compares that count with the product activities the worker recorded for the bench organization.
- **Counts.** `bench.rows_created.<type>` minus `bench.rows_deleted.<type>` must equal the change of the organization's `<type>` count in `channel_counters`.
- **Books.** A full run ends with the worker's own verify (`pnpm sync:verify`): every counter, the sequence counter and the frontiers against the tables. Differences, or no answer in time, fail the run. On a difference the worker rebuilds its books, which moves the sync generation, so every connected client refetches.

A scenario of your own gets the response check for free and the CDC checks by counting those rows. `--all` waits 15 seconds between scenarios so a saturating one does not slow the next.

## Reading a run

Every five seconds a run prints where it is and what the last interval did. On a terminal the line redraws in place; piped into a file, every line stays.

```
attachment-edit · hold 50 · 14s/40s
  vus +250 ▸61 ✓310 ✗0 · 940 req/s · p50 6.2ms p95 31ms p99 58ms · 2xx 4,700 · bench.rows_written +4,700 · gen lag 3.1ms
```

`+250` VUs started in the interval, `▸61` are running, `✓` completed and `✗` failed so far. Latencies are time to first byte for the interval's requests. `gen lag` is the load generator's own event-loop delay: when it passes 50 ms the run warns that its latencies include the generator's queueing.

The summary at the end has a row per endpoint (requests, percentiles, non-2xx, timeouts), the scenario's own histograms and counters, every check with its numbers, and the change from the last baseline. A run also writes a log: one JSON line per interval, then the summary, at the path the summary prints. `yjs-typing` adds the driver's full report to it.

## Baselines and logs

Baselines and logs live in `cella-bench/` inside the git directory (`git rev-parse --git-common-dir`), which every worktree of the clone shares and `git status` never shows. A passing full run appends to `baselines/<scenario>.json`. Each entry names its runner (`cella-bench@1`) and keeps the per-endpoint numbers and the scenario's `primary` latency, `http.response_time.p95` unless the scenario picks another: `sse-fanout` compares its range fetches, `yjs-typing` its peer latency. Entries of an earlier runner stay in the file and are never compared. `logs/` keeps the last 30 logs per scenario.

## Collaborative typing

`yjs-typing` measures the Yjs relay under people typing together. Its single run drives real y-websocket clients (`src/yjs-typing.ts`) against the relay port, in the bench process. Each document is a bench attachment with a few typing clients and one idle viewer, and some users watch the SSE stream as non-editing viewers. Documents start spread over ten seconds, and every client is a user of its own.

```sh
pnpm bench yjs-typing                                  # with its checks
YJS_DOCS=40 YJS_DURATION_S=60 pnpm bench yjs-typing    # another shape
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `YJS_DOCS` | 20 | Documents edited at once |
| `YJS_TYPERS` | 3 | Typing clients per document |
| `YJS_DURATION_S` | 120 | Typing time |
| `YJS_KEYSTROKE_MS` | `200-300` | Spacing of one client's keystrokes |
| `YJS_SSE_VIEWERS` | one per document | Users on the SSE stream |
| `YJS_STAGGER_S` | 10 | Seconds over which documents start typing; 0 starts them together |
| `YJS_DOC_OFFSET` | 0 | First bench attachment: a second run on one database takes fresh documents |
| `YJS_PORT` | `devPorts.yjs` | The relay's port |

The report covers:

- **Latency.** From a keystroke to the document's viewer receiving it, and to the relay's `Saved` answer.
- **The log channel.** `pg_notify` per second on `yjs_log`, and how long a probe notification on it takes to arrive.
- **Materializations.** Writes of each document to its entity row per minute, the longest gap between them while typing, and the CDC activities and SSE notifications they cause.
- **The stack.** CPU, memory and database connections of the relay, API and CDC worker (found by port), the Postgres container's CPU, and the database's sessions, wait events, commits and WAL.
- **After typing.** How long until every edit is saved, the same on every client, and written to the entity row.

The relay writes a document's last state a while after its last client leaves (`yjsCleanupDelayMs`): wait that long after a typing run before a run whose activity count must be exact.

## Interpreting results

Bench measures the live dev stack. Before calling a result a regression:

- **Auth reads.** A session is read once per 10 seconds per browser and a token at every request. Memberships are cached per process until they change, so the first request of each user in a run also reads its memberships.
- **Per-mutation RLS transactions.** Each write wraps permission check + update in one short transaction that also sets tenant/user GUCs. The write ceiling is pool size (`DATABASE_POOL_MAX`) and DB round-trip latency, not handler CPU alone.
- **Rate limiting is effectively off.** The seeded bench tenant has a very high `apiPointsPerHour`, the points limiter has an in-process fast path, and every scenario starts with the bench users' per-user budgets (stream connects, sync reads) cleared.
- **Saturation.** At their configured arrival rates `attachment-edit` and `page-load` saturate a laptop that also runs the stack: latencies then show queueing, not the endpoint, and timeouts are counted per endpoint. Compare the trend between runs.
- **One generator thread.** The runner sends all load from one Node thread. The `gen lag` reading tells when that thread, not the stack, is the limit.
- **A worktree's own stack.** Bench follows the checkout's port offset, so a worktree measures its own stack, never the main checkout's.
- **Telemetry is off without a key.** OpenTelemetry exports only when `MAPLE_SECRET_INGEST_KEY` or `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
