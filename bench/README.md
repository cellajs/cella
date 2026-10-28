# @cellajs/bench

The bench package: load testing for the backend, cdc, and yjs services with a runner of its own, driven by the **bench CLI**.

### TL;DR

Bench load-tests your running development app with repeatable scenarios and reusable seed data,
its users already signed in. A run passes on what the stack did with the load, not on how fast a laptop is: every response
accepted, every written row recorded by the CDC worker, counters still right. Latencies are saved
and compared with the previous run: read them as trends, not absolutes.

## Prerequisites

Start these first:

- **Postgres** seeded with app data (`pnpm docker` + `pnpm seed`)
- **Services** running via `pnpm dev`

## Commands

| Command | Description |
| --- | --- |
| `pnpm bench` | Interactive scenario picker |
| `pnpm bench <name>` | Run one scenario non-interactively |
| `pnpm bench --all` | Run every scenario in sequence |
| `pnpm bench --all --short` | Smoke run of every scenario: one VU per role, no thresholds, no baselines |
| `pnpm bench help` | List scenarios |
| `pnpm db:seed` | Seed test data (idempotent, cleans first) |
| `pnpm db:teardown` | Remove all bench data (baselines are kept) |

One run holds a stack at a time: a second `pnpm bench` against the same stack stops and names the run that holds it.

## Scenarios

Each scenario asks one question of the stack, as a TypeScript module in `scenarios/`.

| Scenario | What it answers | Checked after the run |
| --- | --- | --- |
| `get-me` | What the guard chain alone costs: the cheapest signed-in request, repeated | Responses |
| `page-load` | How the read path holds when every visitor also reads data, a product list included | Responses |
| `attachment-edit` | How many edits per second the write path takes | Responses, one activity per edit |
| `attachment-churn` | Whether creating and deleting rows in batches keeps the books right | Responses, one activity per row, the attachment count |
| `sse-fanout` | Whether every subscriber of an organization hears of a change and can fetch it | Responses, one activity per edit, notifications heard, no stream errors |
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
- **What a VU does** is `vu`, or `roles` for a mix of VUs (`sse-fanout`), or `run` for a scenario that drives its own clients once (`yjs-typing`).
- **The VU** carries HTTP, event-stream and WebSocket clients and counters of its own ([types.ts](./src/runner/types.ts)). `benchUser(vu.index)` hands each VU a seeded user. A VU that throws counts as failed.
- **Names are typed.** `counters` and `histograms` list every name the scenario records, and `vu.counter`, `expect` and `forbid` accept only those, so a misspelled name fails `pnpm check`. Give a request with ids in its path a `name`, so the endpoint table has one row for it.

## Checks

A run fails, and is neither compared nor saved, when one of these fails:

- **Responses.** Too many responses are not 2xx (`maxRejectedShare`), also with `--short`: the latency of a 401 says nothing about the endpoint.
- **VU failures.** Too many VUs did not complete (`maxErrorRate`).
- **Thresholds.** `thresholds` caps any recorded latency, such as `'http.response_time.p95': 3000`. `--short` skips them.
- **Counters.** `expect` names counters that must have counted, `forbid` counters that must stay at zero. `--short` checks only `forbid`: each role plays once.
- **Activities.** The rows a scenario counts as `bench.rows_written` must match the activities the CDC worker recorded for the bench organization.
- **Counts.** `bench.rows_created.<type>` minus `bench.rows_deleted.<type>` must equal the change of the organization's `<type>` count in `channel_counters`.
- **Books.** A full run ends with the worker's own verify (`pnpm sync:verify`) of its counters against the tables. Differences, or no answer in time, fail the run; on a difference the worker also rebuilds its books ([Verify and rebuild](../cdc/README.md#verify-and-rebuild)).

A scenario of your own gets the response check for free and the CDC checks by counting those rows. `--all` pauses between scenarios so a saturating one does not slow the next.

## Reading a run

A run prints where it is and what the last interval did:

```
attachment-edit · hold 50 · 14s/40s
  vus +250 ▸61 ✓310 ✗0 · 940 req/s · p50 6.2ms p95 31ms p99 58ms · 2xx 4,700 · bench.rows_written +4,700 · gen lag 3.1ms
```

`+250` VUs started in the interval, `▸61` are running, `✓` completed and `✗` failed so far. Latencies are time to first byte. `gen lag` is the load generator's own event-loop delay.

The summary at the end has a row per endpoint, the scenario's own numbers, every check and the change from the last baseline. A run also writes a JSON log at the path the summary prints.

## Baselines and logs

Baselines and logs live in `cella-bench/` inside the git directory (`git rev-parse --git-common-dir`), which every worktree of the clone shares and `git status` never shows. A passing full run appends to `baselines/<scenario>.json`, and the next run compares its `primary` latency with it: the p95 response time unless the scenario picks another, such as `yjs-typing`'s peer latency. `logs/` keeps the recent logs per scenario.

## Collaborative typing

`yjs-typing` drives real y-websocket clients ([yjs-typing.ts](./src/yjs-typing.ts)) against the relay. Each document is a bench attachment with a few typing clients and an idle viewer, while other users watch the SSE stream.

```sh
pnpm bench yjs-typing                                  # with its checks
YJS_DOCS=40 YJS_DURATION_S=60 pnpm bench yjs-typing    # another shape
```

| Variable | Meaning |
| --- | --- |
| `YJS_DOCS` | Documents edited at once |
| `YJS_TYPERS` | Typing clients per document |
| `YJS_DURATION_S` | Typing time |
| `YJS_DOC_OFFSET` | First bench attachment: a second run on one database takes fresh documents |

The others, with every default, are in [config.ts](./src/config.ts). The report covers the latency from a keystroke to a viewer and to the relay's `Saved` answer, how often each document is materialized to its row, the load on the relay, API, CDC worker and Postgres, and how long until every edit is saved and the same everywhere.

The relay writes a document's last state a while after its last client leaves (`yjsCleanupDelayMs`): wait that long after a typing run before a run whose activity count must be exact.

## Interpreting results

Bench measures the live dev stack. Before calling a result a regression:

- **Auth and tenant transactions.** Every request reads its session or token, and every write runs in a short tenant transaction: writes are bound by the database pool and round trips, not handler CPU.
- **Rate limiting is effectively off.** The bench tenant's budget is very high, and every scenario starts with the bench users' own budgets cleared.
- **Saturation.** At their configured arrival rates `attachment-edit` and `page-load` saturate a laptop that also runs the stack: latencies then show queueing, not the endpoint. Compare the trend between runs.
- **One generator thread.** The runner sends all load from one Node thread. A high `gen lag`, which the run warns about, means that thread is the limit, not the stack.
- **A worktree's own stack.** Bench follows the checkout's port offset, so a worktree measures its own stack, never the main checkout's.
- **Telemetry is off without a key** ([Observability](../cella/OTEL.md#destination)).
