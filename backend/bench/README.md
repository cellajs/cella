# Bench

Load testing for the backend, cdc, and yjs services: the app's scenarios and checks, run by `pnpm cella bench`.

### TL;DR

Bench load-tests your running development app with repeatable scenarios and reusable seed data, its users already signed in. A run passes on what the stack did with the load, not on a laptop's speed: responses accepted, every written row recorded by CDC, counters still right. Latencies are saved and compared with the previous run, as trends.

## Prerequisites

A run measures the stack this checkout runs: Postgres from `pnpm docker`, seeded by `pnpm seed`, and the
services of `pnpm dev`.

With `--isolated` a run needs neither. It then starts a testbed for the run and stops it after.
A testbed is a copy of the app on a database and ports of its own, as `pnpm testbed` starts it.

## Commands

| Command | Description |
| --- | --- |
| `pnpm cella bench` | Pick a scenario from a list |
| `pnpm cella bench <name>` | Run one scenario |
| `pnpm cella bench --all` | Run every scenario in turn, with a table at the end |
| `pnpm cella bench --all --short` | Smoke run of every scenario: one VU per role, no thresholds, no baselines |
| `pnpm cella bench <name> --isolated` | Run on a testbed, beside `pnpm dev` |
| `pnpm cella bench <name> --rtt 50` | Add a 50 ms network round trip to every request and stream |
| `pnpm cella bench --help` | The other flags |
| `pnpm --filter backend bench:seed` | Seed the bench data, cleaning first |
| `pnpm --filter backend bench:teardown` | Remove all bench data but the baselines |

One run holds a stack at a time. A second run against the same stack stops and names the run that holds it.

## Scenarios

Each scenario asks one question of the stack, as a TypeScript module in `scenarios/`.

| Scenario | What it answers | Checked after the run |
| --- | --- | --- |
| `get-me` | What the guard chain alone costs: the cheapest signed-in request, repeated | Responses |
| `page-load` | How the read path holds when every visitor also reads data, a product list included | Responses |
| `detail-read` | What a few hundred signed-in readers of one row at once cost the detail route | Responses |
| `attachment-edit` | How many edits per second the write path takes | Responses, one activity per edit |
| `attachment-churn` | Whether creating and deleting rows in batches keeps the books right | Responses, one activity per row, the attachment count |
| `sse-fanout` | Whether every subscriber of an organization hears of a change and can fetch it, and how long until all have heard | Responses, one activity per edit, notifications heard, no stream errors |
| `yjs-typing` | How the Yjs relay holds under people typing together | Documents converged, saved and written to their rows |
| `edit-propagation` | How long until a reader viewing the channel holds an edit, with the stack at rest | Every edit seen, the reader's row equals the database's |
| `edit-propagation-busy` | The same while other writers edit at a steady rate | As `edit-propagation` |
| `reconnect-catchup` | What a deploy costs: every stream ends at once and every client catches up together | The clients missed the edits while away, all caught up, rows equal the database's |
| `offline-replay` | How a queue of offline edits merges, and what draining it one write at a time costs | Last writer wins on every row, rows equal the database's |
| `access-revocation` | Whether a removed member stops hearing and reading the organization while others write | No frame or read after the removal, none with a range key past its lifetime, the removal heard, the bystander still hears |
| `full-list-read` | What a fresh client pays to read a whole large list | Every row read, rows equal the database's |

## Writing a scenario

A scenario declares its load as phases and what one virtual user (VU) does. New VUs arrive on schedule whether or not earlier ones are done, as visitors do.

```ts
import { defineScenario } from '@cellajs/cli/bench';
import { attachmentEdit } from '../attachment-requests';
import { benchUser } from '../bench-user';

export default defineScenario({
  description: 'the write path under a step-up, one rename per request',
  phases: [
    { name: 'hold 25', duration: 10, arrivalRate: 25 },
    { name: 'hold 50', duration: 10, arrivalRate: 50 },
  ],
  counters: ['bench.rows_written'],
  checks: { maxErrorShare: 1, thresholds: { 'http.response_time.p95': 3000 } },
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

- **Phases** start `arrivalRate` VUs per second for `duration` seconds, or `arrivalCount` VUs over the duration.
- **Ramps.** `rampTo` ramps a phase's arrival rate.
- **What a VU does** is `vu`, `roles` for a mix of VUs, or `run` for a scenario that drives its own clients once.
- **The VU** carries HTTP, event-stream and WebSocket clients and counters. A VU that throws counts as failed.
- **More people in one VU.** `vu.client()` gives a `run` scenario one more person on a connection of its own.
- **Users.** `benchUser(vu.index)` hands each VU a seeded user.
- **Names are declared.** `counters` and `histograms` list every name the scenario records.
- **Names are typed.** Any other name in `vu.counter`, `expect` or `forbid` fails `pnpm check`.
- **Request names.** Give a request with ids in its path a `name`. The endpoint table then has one row for it.

## Sync scenarios

The sync scenarios drive `sync/client.ts`, one person's sync engine at the protocol level: the stream, a catchup on every connect, range reads from a cursor, and the rows it holds. It reads what it hears at once, as a viewed channel does, or in the slot the frontend's scheduler would take. Each scenario ends by comparing what its clients hold with the database.

They edit and read the product the scenario file passes: the template's is the attachment (`attachmentProduct` in `attachment-requests.ts`). An app runs them on its own product with a scenario file of its own that passes its `BenchProduct` entry.

## Files

- `run.ts` is the entry `pnpm cella bench` runs: the app's steps around the scenarios.
- `scenarios/` holds one module per scenario, `seeds/` the bench data ([seed registry](./seeds/README.md)).
- `sync/` holds the sync client, the product a sync scenario edits and the driver of each sync scenario.
- `config.ts` reads ports and URLs from `appConfig.services`, and the `YJS_*` run shape from the environment.

## Checks

A failed run is neither compared nor saved. A run fails when one of these fails:

- **Responses.** More non-2xx responses than `maxRejectedShare` allows, also with `--short`.
- **VU failures.** More VUs did not complete than `maxErrorShare` allows.
- **Thresholds.** `thresholds` caps any recorded latency, such as `'http.response_time.p95': 3000`. `--short` skips them.
- **Counters.** `expect` names counters that must have counted, `forbid` counters that must stay at zero.
- **Counters with `--short`.** Only `forbid` is checked, since each role plays once.
- **Activities.** `bench.rows_written` must match the activities CDC recorded in the bench organization.
- **Counts.** `bench.rows_created.<type>` minus `bench.rows_deleted.<type>` must equal the change in `channel_counters`.
- **Books.** A full run ends with `pnpm sync:verify`, which must find every counter matching its table in time.
- **Convergence.** A sync scenario forbids `bench.rows_diverged`: a row a client holds that differs from the database.

A scenario of your own gets the response check for free. It gets the CDC checks by counting those rows. `--all` pauses between scenarios, so a saturating one does not slow the next.

## Reading a run

A run prints where it is and what the last interval did:

```
attachment-edit · hold 50 · 14s/40s
  vus +250 ▸61 ✓310 ✗0 · 940 req/s · p50 6.2ms p95 31ms p99 58ms · 2xx 4,700 · bench.rows_written +4,700 · gen lag 3.1ms
```

- `+250` VUs started in the interval.
- `▸61` are running.
- `✓` completed and `✗` failed so far.
- Latencies are time to first byte.
- `gen lag` is the load generator's own event-loop delay.

The summary at the end has a row per endpoint, the scenario's own numbers, every check and the change from the last baseline. A run also writes a JSON log at the path the summary prints.

## Baselines and logs

A passing full run appends to `baselines/<scenario>.json`. The next run compares its `primary` latency with it, by default the p95 response time. A scenario can pick another, such as `yjs-typing`'s peer latency. A run with `--rtt` compares only with runs of the same round trip. `logs/` keeps the recent logs per scenario.

Baselines and logs live in `cella-bench/` inside the git directory that `git rev-parse --git-common-dir` prints. Every worktree of the clone shares it, and `git status` never shows it.

## Interpreting results

Bench measures a live stack: the dev stack, or a testbed with `--isolated`. Before calling a result a regression:

- **Auth and tenant transactions.** Writes are bound by the database pool and round trips, not handler CPU.
- **Rate limiting is effectively off.** The bench tenant's budget is very high, and user budgets start cleared.
- **Saturation.** `attachment-edit` and `page-load` saturate a laptop that also runs the stack.
- **Queueing.** A saturated laptop's latencies show queueing, not the endpoint.
- **One generator thread.** All load comes from one Node thread. A high `gen lag` means that thread is the limit.
- **A worktree's own stack.** A worktree's run follows its port offset and never measures the main checkout.
