---
syncBreaking: true
clientCacheBump: false
---

# Bench runs its own load runner: scenarios are TypeScript modules

Artillery is gone from `bench/`. A scenario is now `bench/scenarios/<name>.ts` with `export default defineScenario({ ... })`
from `bench/src/runner`, and the YAML files, `bench/src/processors/` and `patches/artillery@2.0.34.patch` are deleted.
Convert every scenario of your own (raak: `cdc-throughput.yaml`, `task-edit.yaml`, `processors/task-edit.ts`,
`processors/task-edits.ts`), then remove the Artillery entries from `bench/package.json` and `pnpm-workspace.yaml`.

## What & why

Artillery brought 257 packages (341 MB) that nothing else uses, a patch for Node 24 worker threads, two package
extensions, two security overrides and telemetry on every run. `bench/src/runner/` replaces it with no dependency:
open-loop phases, one keep-alive connection per VU, time to first byte, a live line every 5 s, typed checks and a JSONL
log. Baselines move to `.git/cella-bench/` with a new epoch (`cella-bench@1`).

## Blast radius

Apps with scenarios or processors of their own: those stop compiling once the sync deletes `processors/auth.ts`.
Every app removes the Artillery workspace entries. projectcampus has no scenarios of its own. No database, cache or
API change.

## Run

No script: manual.

## Manual steps

1. Per own scenario: write `bench/scenarios/<name>.ts` (worked example below) and delete its YAML and processor.
2. Move shared payload builders out of `bench/src/processors/` (raak: `git mv bench/src/processors/task-edits.ts bench/src/task-edits.ts`), then delete the folder.
3. raak: one VU function serves both task scenarios, with `loops` 5 (`task-edit`, phases 50/100/125 per s) and 10 (`cdc-throughput`, phases 25/50/75/100 per s).
4. A processor's `events.emit('counter', name, n)` becomes `vu.counter(name, n)`; list the name in `counters`. A `# expect:` or `# forbid:` comment becomes `checks.expect` / `checks.forbid`.
5. `bench/package.json`: remove the `artillery` and `artillery-plugin-ensure` devDependencies and the `yjs-typing` script, if the sync left them.
6. `pnpm-workspace.yaml`: remove `allowBuilds` `@playwright/browser-chromium` and `unix-dgram`, `minimumReleaseAgeExclude` `moment@2.31.0`, overrides `csv-parse@<7.0.2` and `moment@>=2.29.2 <2.31.0`, `packageExtensions` `@artilleryio/sketches-js` and `artillery`, and `patchedDependencies`.
7. Delete `patches/artillery@2.0.34.patch`. An app with pnpm patches of its own keeps `patches/` and the `COPY patches/ ./patches/` line in the `manifests` stage of `Dockerfile`, which the template dropped.
8. `knip.jsonc` workspace `bench`: entry `["scenarios/*.ts", "src/seeds/*.bench.ts"]`, no `ignoreDependencies`.
9. Run `pnpm install`: the lockfile loses Artillery's packages.

### Worked example: attachment-edit

Before, a YAML file and a processor that set Artillery variables:

```yaml
config:
  target: "{{ $processEnvironment.BASE_URL }}"
  processor: "../src/processors/attachment-edit.ts"
  phases:
    - { duration: 10, arrivalRate: 25, name: "hold 25" }
    - { duration: 10, arrivalRate: 50, name: "hold 50" }
  plugins:
    ensure: { maxErrorRate: 1, thresholds: [{ http.response_time.p95: 3000 }] }
scenarios:
  - beforeScenario: "authenticate"
    flow:
      - loop:
          - function: "buildAttachmentEditPayload"
          - put:
              url: "/{{ tenantId }}/{{ orgId }}/attachments/{{ attachmentId }}"
              headers: { cookie: "{{ cookie }}" }
              json: "{{ payload }}"
              afterResponse: "countEdit"
          - think: "50ms"
        count: 20
```

After, one module; the payload builder is a plain function (`bench/src/attachment-requests.ts`):

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

`authenticate` and its `threadId * 97` stride are gone: `benchUser(vu.index)` hands each VU the next seeded user.
For raak's task scenarios the request is `vu.http.put(`${ORG_PATH}/tasks/${taskId(userIndex % TOTAL_TASKS)}`, { json: allEditBuilders[i % allEditBuilders.length](), headers: { cookie }, name: 'PUT /tasks/:id' })`.

## Verify

```sh
pnpm install
pnpm bench help
pnpm bench --all --short
pnpm check
```
