# Bench

Load testing for the backend, cdc, and yjs services: the app's scenarios and checks, run by `pnpm cella bench`.

### TL;DR

Bench load-tests your running development app with repeatable scenarios and reusable seed data,
its users already signed in. A run passes on what the stack did with the load, not on how fast a laptop is: every response
accepted, every written row recorded by the CDC worker, counters still right. Latencies are saved
and compared with the previous run: read them as trends, not absolutes.

## Prerequisites

A run measures the stack this checkout runs: Postgres seeded with app data (`pnpm docker` + `pnpm seed`) and the
services of `pnpm dev`. With `--isolated` it needs neither: it runs on a testbed, a copy of the app on a database and
ports of its own (`pnpm cella testbed`), started for the run and stopped after.

## Commands

| Command | Description |
| --- | --- |
| `pnpm cella bench` | Pick a scenario from a list |
| `pnpm cella bench <name>` | Run one scenario |
| `pnpm cella bench --all` | Run every scenario in turn, with a table at the end |
| `pnpm cella bench --all --short` | Smoke run of every scenario: one VU per role, no thresholds, no baselines |
| `pnpm cella bench <name> --isolated` | Run on a testbed, beside `pnpm dev` |
| `pnpm cella bench --help` | The other flags |
| `pnpm --filter backend bench:seed` | Seed the bench data (idempotent, cleans first) |
| `pnpm --filter backend bench:teardown` | Remove all bench data (baselines are kept) |

One run holds a stack at a time: a second run against the same stack stops and names the run that holds it.

## Scenarios

Each scenario asks one question of the stack, as a TypeScript module in `scenarios/`.

| Scenario | What it answers | Checked after the run |
| --- | --- | --- |
| `get-me` | What the guard chain alone costs: the cheapest signed-in request, repeated | Responses |
| `page-load` | How the read path holds when every visitor also reads data, a product list included | Responses |
| `detail-read` | What a few hundred signed-in readers of one row at once cost the detail route | Responses |
| `attachment-edit` | How many edits per second the write path takes | Responses, one activity per edit |
| `attachment-churn` | Whether creating and deleting rows in batches keeps the books right | Responses, one activity per row, the attachment count |
| `sse-fanout` | Whether every subscriber of an organization hears of a change and can fetch it | Responses, one activity per edit, notifications heard, no stream errors |
| `yjs-typing` | How the Yjs relay holds under people typing together | Documents converged, saved and written to their rows |

## Writing a scenario

A scenario declares its load as phases and what one virtual user (VU) does. New VUs arrive on schedule whether or not earlier ones are done, as visitors do.

```ts
import { defineScenario } from '@cellajs/cli/bench';
import { attachmentEdit } from '../attachment-requests';
import { benchUser } from '../bench-user';

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
      const res = await vu.http.patch(path, { json, headers: { cookie }, name: 'PATCH /attachments/:id' });
      if (res.status === 200) vu.counter('bench.rows_written');
      await vu.think(50);
    }
  },
});
```

- **Phases** start `arrivalRate` VUs per second for `duration` seconds (`rampTo` ramps the rate), or `arrivalCount` VUs spread over the duration.
- **What a VU does** is `vu`, or `roles` for a mix of VUs (`sse-fanout`), or `run` for a scenario that drives its own clients once (`yjs-typing`).
- **The VU** carries HTTP, event-stream and WebSocket clients and counters of its own (the `Vu` type of `@cellajs/cli/bench`). `benchUser(vu.index)` hands each VU a seeded user. A VU that throws counts as failed.
- **Names are typed.** `counters` and `histograms` list every name the scenario records, and `vu.counter`, `expect` and `forbid` accept only those, so a misspelled name fails `pnpm check`. Give a request with ids in its path a `name`, so the endpoint table has one row for it.

## Files

- `run.ts` is the entry `pnpm cella bench` runs: the app's steps around the scenarios. It waits for the stack, seeds,
  signs bench user 0 in, starts each scenario from cleared rate limits and a settled CDC worker, and checks what the
  worker recorded after it.
- `scenarios/` holds one module per scenario, `seeds/` the bench data ([seed registry](./seeds/README.md)).
- `config.ts` reads the ports, URLs and the `YJS_*` shape of a run from the environment and `backend/.env`.

## Checks

A run fails, and is neither compared nor saved, when one of these fails:

- **Responses.** Too many responses are not 2xx (`maxRejectedShare`), also with `--short`: the latency of a 401 says nothing about the endpoint.
- **VU failures.** Too many VUs did not complete (`maxErrorRate`).
- **Thresholds.** `thresholds` caps any recorded latency, such as `'http.response_time.p95': 3000`. `--short` skips them.
- **Counters.** `expect` names counters that must have counted, `forbid` counters that must stay at zero. `--short` checks only `forbid`: each role plays once.
- **Activities.** The rows a scenario counts as `bench.rows_written` must match the activities the CDC worker recorded for the bench organization.
- **Counts.** `bench.rows_created.<type>` minus `bench.rows_deleted.<type>` must equal the change of the organization's `<type>` count in `channel_counters`.
- **Books.** A full run ends with the worker's own verify (`pnpm sync:verify`) of its counters against the tables. Differences, or no answer in time, fail the run.

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

## Interpreting results

Bench measures a live stack: the dev stack, or a testbed with `--isolated`. Before calling a result a regression:

- **Auth and tenant transactions.** Every request reads its session or token, and every write runs in a short tenant transaction: writes are bound by the database pool and round trips, not handler CPU.
- **Rate limiting is effectively off.** The bench tenant's budget is very high, and every scenario starts with the bench users' own budgets cleared.
- **Saturation.** At their configured arrival rates `attachment-edit` and `page-load` saturate a laptop that also runs the stack: latencies then show queueing, not the endpoint. Compare the trend between runs.
- **One generator thread.** The runner sends all load from one Node thread. A high `gen lag`, which the run warns about, means that thread is the limit, not the stack.
- **A worktree's own stack.** Bench follows the checkout's port offset, so a worktree measures its own stack, never the main checkout's.
