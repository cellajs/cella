# Infra CLI

**Move to EU cloud, keep the DX you know.**

### TL;DR

The EU has great cloud providers; what it lacks is an easy way to deploy within them.

Infra CLI sets up a full-stack app on European cloud provider [Scaleway](https://www.scaleway.com/), then deploys every release with zero downtime through one CI-agnostic command.

## Key features

**Go European without looking back.** Scaleway is one of Europe's most established cloud providers.

**Everything is yours.** Your Scaleway account, your action runner (GitHub Actions today).

**Full stack deployment.** One guided setup: domain, HTTPS, load balancer, managed database, file storage, servers.

**Releases can't break what is running.** Fresh servers per release.

**Secure by default.** No machine logins, descending keys.

**Observable by default.** One OpenTelemetry trace per deploy.

**Easy to leave.** Pulumi, Docker Compose and OTLP.

## How it works

**Setup** (`pnpm infra`) is a wizard that takes an empty Scaleway account to a live, TLS'd, health-checked app in one sitting from one Owner API key ([fresh installation](../cella/DEPLOYMENT.md#fresh-installation)).

**Release** is one command, triggered by a published GitHub release, a manual dispatch, or any other CI:

```
pnpm --filter infra run deploy --mode <production|staging> --sha <sha>
```

It owns the whole pipeline ([deploy flow](../cella/DEPLOYMENT.md#deploy-flow)): when the release's images or frontend files are missing, a builder machine it makes builds them from the pushed commit. CI deploys with `--defer-reap`; a follow-up `pnpm --filter infra run reap` job destroys the displaced VMs off the critical path (already detached from every LB pool).

**Manage** is the same `pnpm infra` entrypoint on an existing stack: one menu for status, reviewing and applying privileged changes (database, VPC, IAM), key and passphrase rotation, runtime secrets, database access and reset, repair (a stale lock, interrupted Pulumi operations, a re-sync of the setup) and [teardown](../cella/DEPLOYMENT.md#teardown). Every action also runs alone as `pnpm infra <action>`, listed by `pnpm infra help` ([advanced operations](../cella/DEPLOYMENT.md#advanced-operations)).

## Core philosophy

Three rules:

1. **Create-then-replace.** A release never mutates a running server: each deploy provisions a new immutable **generation** per service, moves LB traffic once it provably serves the expected version, then destroys the displaced one. Under `singleVM` the backend host overlaps too, and its in-process cdc and jobs move once the old VM is reaped ([rollout strategies](../cella/DEPLOYMENT.md#rollout-strategies)).
2. **Content-addressed identity.** A generation id hashes the release SHA plus static config: a re-run is a no-op and a manual `pulumi up` cannot start a competing generation.
3. **Least-privilege keys, per mode.** Principals are per app×mode (`<slug>-<mode>-…`) in one IAM group, resolved by the canonical names in [lib/scaleway/principals.ts](lib/scaleway/principals.ts); no principal id is persisted or exported ([key tiers](../cella/DEPLOYMENT.md#credentials)).

## Security boundaries

- **The CI key never writes IAM policy** (no `IAMPolicyManager`): granting permissions self-escalates to full admin, so identity administration is a human action with an **Owner API key**, made for the occasion. Every other privileged run takes the **operator key**, which writes no IAM and which Scaleway accepts from a dedicated IP address only. The CI key writes no IAM at all: each machine identity has one standing key, made at an Owner moment and kept in `/<slug>-<mode>/deploy/`, and a deploy only hands it over ([tasks/stage-generation-keys.ts](tasks/stage-generation-keys.ts)).
- **The CI key reads no secret of the app's.** It reads values in `/<slug>-<mode>/deploy/` only (the machine keys it hands over, the telemetry ingest key) and checks the services' copies from metadata. Secret containers and values are made by an apply on the operator key ([lib/scaleway/deploy-policy.ts](lib/scaleway/deploy-policy.ts)).
- **The observer application** is the read-only principal: read sets on the app's projects, IAM read, and read on the state and boot-diagnostics buckets; from the dedicated IP address only. Its key lives in `infra/.env.<mode>` (`SCW_OBSERVER_*`), never in git or GitHub. The admin application it replaces is retired: an apply lets the operator into bucket policies written before it with the admin key from its custody secret, and **Update identities** then deletes it.
- **VM keys are per service and per deploy**, path-conditioned (`resource.name.startsWith`). Cloud-init carries only the **boot key**; the service key arrives in a **single-access** Secret Manager bundle. A consumed bundle on first boot halts the VM as an interception signal; reboots reuse the on-disk pair.
- **Bucket policies are deny-by-default** for everyone not listed, org admins included (the Owner can always edit a policy). The deploy key's statement on each bucket is object-level: no bucket configuration, no policy, no `s3:DeleteObjectVersion`, so a leaked deploy key cannot destroy state history or user data. A bucket's configuration and policy change through an apply.
- **Secret folders are the boundary:** `/<slug>-<mode>/<service>/` holds one copy of every secret that service consumes, so a secret of several consumers is stored once in each one's folder and a machine key reads its own folder only; `/handoff/`, `/deploy/`, `/engine/` (unreadable from machines). A change of consumers adds or removes copies and writes no IAM.

## Observability

The deploy command opens an OTel trace: every pipeline step is a span, and audit events (`deploy.started`, `<service> promoted to generation <id>`, `deploy.failed`, ...) stream to the OTLP endpoint. Each VM's **boot runner** joins the trace through the boot plan's `traceparent` and reports boot phases, failures and a crash-log tail. Every VM also uploads its **boot account** (its boot log and JSONL events) to a dedicated bucket at the end of every boot: `pnpm --filter infra diag --sha <sha>` prints one release's account for each service that boots its own VM (under `singleVM`, the host alone), or says that release has none; without `--sha` it prints each service's newest; `--replay` re-ships the events. It reads with the observer key. A failed rollout names each new machine's account in the run's record. Every deploy also writes one **run record** and its log to the same bucket, under `runs/<run>/`, which `pnpm infra runs` reads on the observer key ([run records](../cella/DEPLOYMENT.md#run-records)). The boot runner redacts by value: each secret it handled (the boot and service keys, every hydrated runtime secret) and any URL userinfo is replaced in its console output, its telemetry and every uploaded object, whatever name printed it. Set the destination with `OTEL_EXPORTER_OTLP_ENDPOINT` (the OTLP base URL, as the OTel SDKs read it: `https://collector:4318`) and `OTEL_EXPORTER_OTLP_HEADERS`, or seed the `maple-secret-ingest-key` secret.

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

The **inventory** checks (`inventory.*`) compare what exists with what the environment declares, as an Owner checks after a suspected break-in: an application the environment does not declare that can act in its project (a rule on the project, or a rule on the organization that does more than read, its own or a group's), a key beside the one each identity holds (the observer holds one per machine), a policy beside an identity's declared one, a person's key without an end date, and a machine that is neither an active generation nor a builder. **Rotate keys** deletes the extra keys and **Update identities** the extra policies; an application or a machine the engine did not make is removed in the console once it is known who made it.

```jsonc
{
  "schemaVersion": 1,
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

Stable check `id`s: `tooling.pulumi`, `config.stackState`, `identity.project`, `github.environment`, `state.bucket`, `state.lock`, `state.pendingOperations`, `rollout`, `secrets.required`, `live.<service>`, `live.components`, `db.publicEndpoint`, `dns.zone`, `stores.<storeId>`. `state.pendingOperations` reads the stack's checkpoint from the state bucket (`.pulumi/stacks/<project>/<stack>.json`, plaintext URNs, no passphrase) and warns about operations an interrupted Pulumi run left there. **Repair stack → Unlock stack** (`pnpm infra unlock`) removes an expired stack lock, and a live one only after a confirm (a run renews its lock while it works). It then lists these operations, drops pending creates after a confirm (export, then import without them, the export kept in the gitignored `infra/.state-backups/` as the rollback), and leaves an interrupted update or delete to `pulumi refresh`. `live.<service>` compares the served release with the `active` pointer of the service that rolls it out: its own, or the host's for a service on the `singleVM` host VM. `live.components` reads the primary service's `/health?depth=full` with the smoke step's verdict rule (`lib/health-components.ts`): only-degraded components warn, an unhealthy one errors. `db.publicEndpoint` reads the managed PostgreSQL instance over the RDB API: a public endpoint while exposure is off warns, and an open one shows its ACL rule count. Providers: `lib/status/providers/`; registered stores add `validate()` checks.

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
| **boot diagnostics** | Logs and JSONL events a VM uploads at boot. |
| **internal route** | Private, ACL-guarded LB frontend forwarding to a service's `internalPort` listener: a stable in-network address across cutovers, which no public pool reaches. |
| **engine config** | The injected app description ([config/engine-config.ts](config/engine-config.ts)); defaults to `appConfig`. |
