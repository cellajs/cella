# @cellajs/bench

The bench package: [Artillery](https://www.artillery.io/) load testing for the backend, cdc, and yjs services, driven by the **bench CLI**.

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
| `pnpm bench --all` | Run every scenario in sequence (quiet, one summary at the end) |
| `pnpm bench --all --short` | Smoke run of every scenario (1s/1VU, no thresholds, no baselines) |
| `pnpm bench help` | List scenarios |
| `pnpm db:seed` | Seed test data (idempotent, cleans first) |
| `pnpm db:teardown` | Remove all bench data (baselines are kept) |

Before the first scenario, bench signs in as one of its users and stops when the stack rejects the cookie, naming the cookie and the config mode it came from. A run in which more than 1% of the responses are not 2xx fails, also with `--short`, and is not saved: it timed rejections, not the endpoint.

## Scenarios

Each scenario asks one question of the stack. The first comment line of its YAML is the description `pnpm bench help` lists.

| Scenario | What it answers | Checked after the run |
| --- | --- | --- |
| `get-me` | What the guard chain alone costs: the cheapest signed-in request, repeated | Responses |
| `page-load` | How the read path holds when every visitor also reads data, a product list included | Responses |
| `attachment-edit` | How many edits per second the write path takes | Responses, one activity per edit |
| `attachment-churn` | Whether creating and deleting rows in batches keeps the books right | Responses, one activity per row, the attachment count |
| `sse-fanout` | Whether every subscriber of an organization hears of a change and can fetch it | Responses, one activity per edit, notifications and delta fetches counted, no stream errors |
| `yjs-typing` | How the Yjs relay holds under people typing together | Documents converged, saved and written to their rows |

The checks:

- **Responses.** More than 1% of responses that are not 2xx fail the run, also with `--short`.
- **Activities.** A processor counts the rows its requests wrote as `bench.rows_written`. After the run the CLI waits for the CDC worker, for at most 60 seconds, and compares that count with the product activities the worker recorded for the bench organization. It prints how long the worker needed to catch up.
- **Counts.** `bench.rows_created.<type>` minus `bench.rows_deleted.<type>` must equal the change of the organization's `<type>` count in `channel_counters`.
- **Books.** A full run ends with the worker's own verify (`pnpm sync:verify`): every counter, the sequence counter and the frontiers against the tables. Corrections, or no answer in time, fail the run. A correction also moves the sync generation, so every connected client refetches.
- **Counters.** A scenario names counters in its header comments: `# expect: a, b` for ones that must have counted, `# forbid: c` for ones that must not. `sse-fanout` expects notifications this way, so subscribers that hear nothing fail the run. A `--short` run is asked only for what is forbidden: its single VU plays one role of a scenario.

A failed run is not compared and not saved as a baseline. A scenario of your own gets the response check for free and the others by emitting those counters or adding those comment lines.

`--all` waits 15 seconds between scenarios so a saturating one does not slow the next. A single-scenario run stays verbose with a live comparison table. The Vitest smoke test `bench/src/tests/all-scenarios.test.ts` runs `--all --short --if-ready` to catch broken scenarios: `--if-ready` makes the run a no-op when this checkout's stack is down.

## Collaborative typing

`yjs-typing` measures the Yjs relay under people typing together. Artillery cannot speak the Yjs protocol, so its one VU runs `src/yjs-typing.ts`, which drives real y-websocket clients against the relay port. Each document is a bench attachment with a few typing clients and one idle viewer, and some users watch the SSE stream as non-editing viewers. Documents start spread over ten seconds, and every client is a user of its own.

```sh
pnpm bench yjs-typing                                  # through the CLI, with its checks
pnpm -C bench yjs-typing --out report.json             # on its own, with a JSON report
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

## Interpreting results

Bench measures the live dev stack. Before calling a result a regression:

- **Auth reads.** A session is read once per 10 seconds per browser and a token at every request. Memberships are cached per process until they change, so the first request of each user in a run also reads its memberships.
- **Per-mutation RLS transactions.** Each write wraps permission check + update in one short transaction that also sets tenant/user GUCs. The write ceiling is pool size (`DATABASE_POOL_MAX`) and DB round-trip latency, not handler CPU alone.
- **Rate limiting is effectively off.** The seeded bench tenant has a very high `apiPointsPerHour`, the points limiter has an in-process fast path, and every scenario starts with the bench users' per-user budgets (stream connects, sync reads) cleared.
- **Saturation.** At their configured arrival rates `attachment-edit` and `page-load` saturate a laptop that also runs the stack: latencies then show queueing, not the endpoint. Compare the trend between runs.
- **A worktree's own stack.** Bench follows the checkout's port offset, and so does every process it starts. A worktree therefore measures its own stack, never the main checkout's.
- **Telemetry is off without a key.** OpenTelemetry exports only when `MAPLE_SECRET_INGEST_KEY` is set.
