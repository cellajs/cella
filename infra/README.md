# Infra CLI

**Move to EU cloud, keep the DX you know.**

### TL;DR

The EU has great cloud providers; what it lacks is an easy way to deploy within them.

Infra CLI sets up a full-stack app on European cloud provider [Scaleway](https://www.scaleway.com/), then deploys every release with zero downtime through one CI-agnostic command.

## Key features

**Go European without looking back.** Scaleway is one of Europe's most established cloud providers.

**Everything is yours.** Your Scaleway account runs the deploys too: a runner in it starts each one as a job, and GitHub holds no key.

**Full stack deployment.** One guided setup: domain, HTTPS, load balancer, managed database, file storage, servers.

**Releases can't break what is running.** Fresh servers per release.

**Secure by default.** No machine logins, descending keys.

**Observable.** One record per deploy, read with a read-only key; an OpenTelemetry trace too when a sink key is set.

**Easy to leave.** Pulumi, Docker Compose and OTLP.

## How it works

**Setup** (`pnpm infra`) is a wizard that takes an empty Scaleway account to a provisioned environment in one sitting, from an Owner API key and the operator key it makes; the runner then deploys the first release like every other ([fresh installation](../cella/DEPLOYMENT.md#fresh-installation)).

**Release** is one command, which the environment's main job runs on a checkout of the target when the runner sees the target move (a published release, a new commit on a followed branch, a line in `infra/environments`):

```
pnpm --filter infra run deploy --mode <production|staging> --sha <sha>
```

It owns the whole pipeline ([deploy flow](../cella/DEPLOYMENT.md#deploy-flow)): when the release's images or frontend files are missing, a builder machine it makes builds them from the pushed commit. Its last step, once smoke passed, destroys the displaced VMs, which every LB pool left before.

**Manage** is the same `pnpm infra` entrypoint on an existing stack: one menu for status, reviewing and applying privileged changes (database, VPC, IAM), key and passphrase rotation, runtime secrets, database access and reset, repair (a stale lock, interrupted Pulumi operations, a re-sync of the setup) and [teardown](../cella/DEPLOYMENT.md#teardown). Every action also runs alone as `pnpm infra <action>`, listed by `pnpm infra help` ([advanced operations](../cella/DEPLOYMENT.md#advanced-operations)).

## Core philosophy

Three rules:

1. **Create-then-replace.** A release never mutates a running server: each deploy provisions a new immutable **generation** per service, moves LB traffic once it provably serves the expected version, then destroys the displaced one. Under `singleVM` the backend host overlaps too, and its in-process cdc and jobs move once the old VM is reaped ([rollout strategies](../cella/DEPLOYMENT.md#rollout-strategies)).
2. **Content-addressed identity.** A generation id hashes the release SHA plus static config: a re-run is a no-op and a manual `pulumi up` cannot start a competing generation.
3. **Least-privilege keys, per mode.** Principals are per app×mode (`<slug>-<mode>-…`) in one IAM group, resolved by the canonical names in [lib/scaleway/principals.ts](lib/scaleway/principals.ts); no principal id is persisted or exported ([key tiers](../cella/DEPLOYMENT.md#credentials)).

## Security boundaries

- **The deploy path reads; it does not rule.** An environment's deploy key and the runner reach its runtime secrets: a deploy hands every new machine its key, and the runner can start the main job with a command of its own. Neither writes IAM, the database instance, the network, DNS, a bucket's policy or state history, and neither changes the main job's definition. A deploy whose key policy is not the declared one stops blocked. Identity administration is a human action with an **Owner API key**, made for the occasion. Every other privileged run takes the **operator key**, which writes no IAM and which Scaleway accepts from a dedicated IP address only.
- **The deploy key writes no secret of the app's.** It writes hand-over bundles in `/<slug>-<mode>/handoff/` and nothing else in Secret Manager, and reads values in `/<slug>-<mode>/deploy/` only: the machine keys it hands over and the telemetry ingest key. Secret containers and values are made by an apply on the operator key ([lib/scaleway/deploy-policy.ts](lib/scaleway/deploy-policy.ts)).
- **The observer application** is the read-only principal: read sets on the app's projects, IAM read, and read on the state and boot-diagnostics buckets; from the dedicated IP address only. Its key lives in `infra/.env.<mode>` (`SCW_OBSERVER_*`), never in git or GitHub. The admin application it replaces is retired: an apply lets the operator into bucket policies written before it with the admin key from its custody secret, and **Update identities** then deletes it.
- **Machine keys are per service and standing**, path-conditioned (`resource.name.startsWith`), made at Owner moments and replaced by **Rotate keys**. Cloud-init carries only the **boot key**; each service key arrives in a **single-access** Secret Manager bundle. A consumed bundle on first boot halts the VM as an interception signal; the intercepted key works until **Rotate keys**. On a shared host the services read one env file, so they share their secrets.
- **Bucket policies are deny-by-default** for everyone not listed, the organization Owner's key included. The deploy key's statement is object-level: no bucket configuration, no policy, no `s3:DeleteObjectVersion`, so on the versioned buckets (state, uploads, diagnostics) a leaked deploy key cannot destroy history. It has no statement on the private uploads bucket and only `geoip/` on the public one.
- **Builds hold no key where the app's code runs.** The builder machine builds the boot bundle and the frontend in keyless containers that reach no metadata service, the frontend on its own copy of the checkout; the engine's code lists the upload from the read-only output. Images carry a build epoch from the builder key, so **Rotate keys** makes every earlier push untrusted.
- **Secret folders are the boundary:** `/<slug>-<mode>/<service>/` holds one copy of every secret that service consumes, so a secret of several consumers is stored once in each one's folder and a machine key reads its own folder only; `/handoff/`, `/deploy/`, `/engine/` (unreadable from machines). A change of consumers adds or removes copies and writes no IAM.

## Observability

Every deploy writes one **run record** and its log to the environment's diagnostics bucket, under `runs/<run>/`, at its start, after every step and at its end, which `pnpm infra runs` reads on the observer key ([run records](../cella/DEPLOYMENT.md#run-records)). Every VM uploads its **boot account** (its boot log, and a crashed container's output) to the same bucket at the end of every boot. A failed rollout names each new machine's account in the run's record; `pnpm infra runs --sha <sha>` prints one release's accounts for each service that boots its own VM (under `singleVM`, the host alone) with the builder's report, and `--machines` each service's newest. With a sink key, the deploy also opens an OTel trace: every pipeline step is a span, audit events (`deploy.started`, `<service> promoted to generation <id>`, `deploy.failed`, ...) stream to the OTLP endpoint, and each VM's **boot runner** joins the trace through the boot plan's `traceparent`. The boot runner redacts by value: each secret it handled (the boot and service keys, every hydrated runtime secret) and any URL userinfo is replaced in its console output, its telemetry and every uploaded object, whatever name printed it. Set the destination with `OTEL_EXPORTER_OTLP_ENDPOINT` (the OTLP base URL, as the OTel SDKs read it: `https://collector:4318`) and `OTEL_EXPORTER_OTLP_HEADERS`, or seed the `maple-secret-ingest-key` secret.

## Status command

`infra status` is a read-only health check of the whole lifecycle. Menu: `pnpm infra` → **Show status**; standalone:

```
pnpm --filter infra status [--mode <production|staging>] [--json]
```

| Option | Effect |
| --- | --- |
| `--mode` | Target stack; defaults to `INFRA_MODE`. |
| `--json` | Emit the versioned contract below; a breaking shape change bumps `schemaVersion`. |

Each check reports `ok | warn | missing | error | unknown`. `unknown` means "could not be evaluated", never a failure: checks needing Scaleway API access (`credential: "scaleway"`) degrade without a key, so the command always completes. `nextAction` is the highest-priority pending step with an exact command.

The **inventory** checks (`inventory.*`) compare what exists with what the environment declares, as an Owner checks after a suspected break-in, and **Rotate keys** prints them at its end: an application the environment does not declare that can act in its project (a rule on the project, or a rule on the organization that does more than read, its own or a group's), a key beside the one each identity holds (the observer holds one per machine), a policy beside an identity's declared one, a person's key without an end date, a machine in any zone of the region that is not an active generation (a builder or a displaced generation counts only while a deploy runs), and a main job definition whose image or command differs from this checkout's. The active generations come from the control object, which the deploy key writes: the inventory finds what an intruder did not disguise. **Rotate keys** deletes the extra keys and **Update identities** the extra policies; an application or a machine the engine did not make is removed in the console once it is known who made it.

```jsonc
{
  "schemaVersion": 2,
  "mode": "staging",
  "generatedAt": "<iso>",
  "stackState": "fresh | partial | bootstrapped",
  "checks": [
    { "id": "live.backend", "title": "Service backend", "status": "ok",
      "detail": "serving 58d6ab0", "credential": "none",
      "nextAction": { "description": "...", "command": "..." } } // present only when actionable
  ],
  "nextAction": { "description": "...", "command": "..." }, // absent when nothing needs doing
  "summary": { "ok": 17, "warn": 0, "missing": 0, "error": 0, "unknown": 0 }
}
```

Stable check `id`s: `config.stackState`, `identity.project`, `identity.keyAges`, `inventory.applications`, `inventory.keys`, `inventory.policies`, `inventory.machines`, `inventory.mainJob`, `state.bucket`, `state.lock`, `state.pendingOperations`, `rollout`, `secrets.required`, `runs.last`, `live.<service>`, `live.components`, `db.publicEndpoint`, `dns.zone`, `stores.<storeId>`. `secrets.required` checks every required copy as a deploy does, `runs.last` says how the main job's newest run ended, and `dns.zone` compares the host's address with the load balancer's. `state.pendingOperations` reads the stack's checkpoint from the state bucket (`.pulumi/stacks/<project>/<stack>.json`, plaintext URNs, no passphrase) and warns about operations an interrupted Pulumi run left there. **Repair stack → Unlock stack** (`pnpm infra unlock`) removes an expired stack lock, and a live one only after a confirm (a run renews its lock while it works). It then lists these operations, drops pending creates after a confirm (export, then import without them, the export kept in the gitignored `infra/.state-backups/` as the rollback), and leaves an interrupted update or delete to `pulumi refresh`. `live.<service>` compares the served release with the `active` pointer of the service that rolls it out: its own, or the host's for a service on the `singleVM` host VM. `live.components` reads the primary service's `/health?depth=full` with the smoke step's verdict rule (`lib/health-components.ts`): only-degraded components warn, an unhealthy one errors. `db.publicEndpoint` reads the managed PostgreSQL instance over the RDB API: a public endpoint while exposure is off warns, and an open one shows its ACL rule count. Providers: `lib/status/providers/`; registered stores add `validate()` checks.

## Key files

Operator keys load in a fixed order ([lib/utils/env-files.ts](lib/utils/env-files.ts)): `backend/.env`, then the repo-root `.env` (existing environment variables win over both), then **`infra/.env.<mode>`**, which OVERRIDES the ambient env so a staging run cannot inherit production values. That file also names the environment's Scaleway project (`SCW_PROJECT_ID`, written by setup): every environment has a project of its own, and `status` reports an error when two share one. A value of the form `keychain:<service>/<account>` or `op:op://…` is resolved on load from the OS keychain or the 1Password CLI, so the file can hold pointers instead of secrets. The CLI reads the observer key (`SCW_OBSERVER_*`) from there and, for diagnostics only, the `SCW_*` pair the process was started with ([lib/scaleway/operator-identity.ts](lib/scaleway/operator-identity.ts)). It reads no privileged key and no passphrase from a file or the environment, in any form: `PULUMI_CONFIG_PASSPHRASE` and `SCW_OWNER_*` found there are dropped with a notice, so nothing on the machine can change infrastructure with nobody at the prompt. The operator key is typed once per run and unlocks it; the passphrase comes from Secret Manager with it. The mode file holds a live secret key; the CLI tightens it to `0600` on sight. The observer's key (`<app>-observer`) reads: enough for status and the plan of an identity update, never for the state side of a run. A bare `infra/.env` is never read, and the CLI says so when it finds one.

## Extending

The engine is plain Pulumi plus the Scaleway SDK; no plugin framework. App-owned registries under [config/](config/): [services.config.ts](config/services.config.ts) (services, strategies, routes), [sizing.ts](config/sizing.ts), [stores.config.ts](config/stores.config.ts) (backing stores), [runtime-secrets.config.ts](config/runtime-secrets.config.ts) and [env-suppliers.config.ts](config/env-suppliers.config.ts) (secrets), [managed-keys.config.ts](config/managed-keys.config.ts), [health.config.ts](config/health.config.ts), [frontend-csp.config.ts](config/frontend-csp.config.ts), [telemetry.config.ts](config/telemetry.config.ts) and [general.config.ts](config/general.config.ts). Modules under [resources/](resources/) are ordinary Pulumi programs. [config/engine-config.ts](config/engine-config.ts) injects the app description, decoupling the engine from any one workspace.

An app is deployable with a Docker image per service, a `/health` endpoint reporting the `X-App-Version` release SHA, and a one-shot `migrate` companion.

## Vocabulary

One name per concept across code and docs:

| Term | Meaning |
| --- | --- |
| **mode** | `production` or `staging`; also the Pulumi stack name. |
| **release** | One git SHA baked into images and generations. |
| **deploy** | One run of the deploy command. |
| **rollout** | The two-wave fleet-moving phase of a deploy. |
| **generation** | One immutable service VM at one content-addressed `genId`. |
| **wave** | One stack update's services, cut over concurrently; 1 = primary, 2 = the rest. |
| **cutover** | Moving a service's LB traffic to its new generation: expand, health-gate, contract, drain. |
| **promote / reap** | Mark a generation `active` in the control object / destroy a displaced one. |
| **control object** | `control/<stack>.json` in the state bucket; per-service `active` and `pendingSha`. |
| **stack lock** | `control/<stack>.lock.json`; conditional write serializing deploys and operator actions. |
| **setup / bootstrap** | The first-ever `pnpm infra` run for a stack (state storage, principals, base infra) and the markers it leaves (`infra:bootstrapComplete`, `bootstrap:computeDeferred`); not VM boot. |
| **Owner API key** | Your own Scaleway user key as organization Owner. It works from every address, so the CLI asks for it only where IAM is written: a setup's Owner moment, **Update identities**, **Rotate keys**, the operator key, a teardown's identities. |
| **operator key** | The key of the `<app>-operator` application: every product in the app's projects plus IAM read, no IAM write, accepted by Scaleway from the dedicated IP address only. Pasted once per run of the CLI. |
| **observer key** | The key of the `<app>-observer` application: read-only, from the dedicated IP address only; `SCW_OBSERVER_*` in `infra/.env.<mode>`. |
| **privileged** | A run or resource that needs the operator key: database, VPC, private network, IAM policies, the state-bucket policy. |
| **boot runner** | The `infra-boot` container run at first boot ([boot/](boot/)): hydrate, pull, migrate, start compose, report. |
| **boot plan** | JSON cloud-init writes for the boot runner: service, compose/env files, secrets, trace context. |
| **hydrate** | Write Secret Manager secrets to `/opt/app/.env.runtime` before the app starts. |
| **boot account** | The boot log a VM uploads at the end of every boot, to the diagnostics bucket. |
| **internal route** | Private, ACL-guarded LB frontend forwarding to a service's `internalPort` listener: a stable in-network address across cutovers, which no public pool reaches. |
| **engine config** | The injected app description ([config/engine-config.ts](config/engine-config.ts)); defaults to `appConfig`. |
