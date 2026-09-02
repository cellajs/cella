# Infra CLI

**Move to EU cloud, keep the DX you know.**

### TL;DR

The EU has great cloud providers; what it lacks is an easy way to deploy within them.

Infra CLI sets up a full-stack app on European cloud provider [Scaleway](https://www.scaleway.com/), then deploys every release with zero downtime through one CI-agnostic command.

## Key features

**Go European without looking back.** Scaleway is one of Europe's most established cloud providers.

**Everything is yours.** Your Scaleway account, your action runner (GitHub Actions today).

**Full stack deployment.** One guided setup: domain, HTTPS, load balancer, managed database, file storage, servers.

**Releases can't break what is running.** Fresh servers per release; traffic moves once the new version provably serves. `singleVM` trades that overlap for a short serving gap ([Core philosophy](#core-philosophy)).

**Secure by default.** No machine logins; credentials descend in privilege (bootstrap → CI deploy → VM keys); key rotation is a menu action.

**Observable by default.** Every deploy emits an OpenTelemetry trace with audit and error events; VMs report boot progress and crash logs to it.

**Easy to leave.** One deploy command, runnable from any CI or a laptop, on Pulumi, Docker Compose and OTLP.

## How it works

**Setup** (`pnpm infra`) is a wizard that takes an empty Scaleway account to a live, TLS'd, health-checked app in one sitting from one pasted bootstrap key: it creates project, state storage, Pulumi passphrase, credential chain and GitHub Environment secrets, runs the first provision and (with docker) the first deploy, then revokes the key. Fresh installs target staging; production is the same wizard with `--mode production` ([fresh installation](../cella/DEPLOYMENT.md#fresh-installation)).

**Release** is one command, triggered by a published GitHub release, a manual dispatch, or any other CI:

```
pnpm --filter infra run deploy --mode <production|staging> --sha <sha> [--build]
```

It owns the whole pipeline: preflights, stack lock, frontend build and hashed-asset upload, two-wave rollout onto fresh VM generations, version verification, atomic frontend entry publish, smoke checks, reaping ([deploy flow](../cella/DEPLOYMENT.md#deploy-flow)). `--build` also bakes and pushes the images, for self-contained laptop and bring-your-own-CI deploys. CI deploys with `--defer-reap`; a follow-up `pnpm --filter infra run reap` job destroys the displaced VMs off the critical path (already detached from every LB pool).

**Manage** is the same `pnpm infra` entrypoint on an existing stack: an operator menu for resume (re-sync config and GitHub secrets), key and passphrase rotation, privileged `pulumi up` on protected infra, drift preview, runtime secrets, database actions, stale-lock clearing and teardown ([advanced operations](../cella/DEPLOYMENT.md#advanced-operations)).

## Core philosophy

Three rules:

1. **Create-then-replace.** A release never mutates a running server: each deploy provisions a new immutable **generation** per service, moves LB traffic once it provably serves the expected version, then destroys the displaced one. Rollback is a revert commit through the same path. Exception: `singleVM` folds every worker onto the backend VM and, because cdc is stop-first, replaces that host in place: health-gated, with a serving gap ([rollout strategies](../cella/DEPLOYMENT.md#rollout-strategies)).
2. **Content-addressed identity.** A generation id hashes the release SHA plus static config: a re-run is a no-op and a manual `pulumi up` cannot start a competing generation. Rollout state lives in one S3 **control object** read by the deploy command and the Pulumi program.
3. **Least-privilege credentials, per mode.** Principals are per app×mode (`<slug>-<mode>-…`) in one IAM group, resolved by the canonical names in [lib/scaleway/principals.ts](lib/scaleway/principals.ts); no principal id is persisted or exported ([credential tiers](../cella/DEPLOYMENT.md#credentials)).

## Security boundaries

- **The CI key never writes IAM policy** (no `IAMPolicyManager`): granting permissions self-escalates to full admin, so identity administration is a transient human action with a **bootstrap key**, used once and revoked. CI does manage applications and keys org-wide through one unconditioned `IAMApplicationManager` rule (to rotate service keys every deploy): an api-key POST carries no `resource.id`, so a conditioned rule 403s ([lib/scaleway/permissions.ts](lib/scaleway/permissions.ts)).
- **The admin app** is the standing human principal: `s3:*` via bucket policies plus read-only on every infra surface, no IAM write; its key is the `admin-key` secret, never in git or GitHub.
- **VM keys are per service and per deploy**, path-conditioned (`resource.name.startsWith`). Cloud-init carries only the **boot key**; the service key arrives in a **single-access** Secret Manager bundle. A consumed bundle on first boot halts the VM as an interception signal; reboots reuse the on-disk pair.
- **Bucket policies are deny-by-default** for everyone not listed, org admins included (the Owner can always edit a policy). Uploads buckets are versioned and CI statements exclude `s3:DeleteObjectVersion`, so a leaked CI key cannot destroy state history or user data.
- **Secret folders are the boundary:** `/<slug>-<mode>/<service>/`, `/shared/`, `/handoff/`, `/engine/` (unreadable from VMs).

## Observability

The deploy command opens an OTel trace: every pipeline step is a span, and audit events (`deploy.started`, `<service> promoted to generation <id>`, `deploy.failed`, ...) stream to the OTLP endpoint. Each VM's **boot runner** joins the trace through the boot plan's `traceparent` and reports boot phases, failures and a crash-log tail. Every VM also uploads **boot diagnostics** (logs and JSONL events) to a dedicated bucket: `pnpm --filter infra diag` reads them, `--replay` re-ships them. Set the destination with `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_EXPORTER_OTLP_HEADERS`, or seed the `maple-secret-ingest-key` secret.

## Status command

`infra status` is a read-only health check of the whole lifecycle. Menu: `pnpm infra` → **Status**; standalone:

```
pnpm --filter infra status [--mode <production|staging>] [--json]
```

| Option | Effect |
| --- | --- |
| `--mode` | Target stack; defaults to `INFRA_MODE`. |
| `--json` | Emit the versioned contract below; a breaking shape change bumps `schemaVersion`. |

Each check reports `ok | warn | missing | error | unknown`. `unknown` means "could not be evaluated", never a failure: checks needing Scaleway API access (`credential: "scaleway"`) degrade without a key, so the command always completes. `nextAction` is the highest-priority pending step with an exact command.

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

Stable check `id`s: `tooling.pulumi`, `config.stackState`, `identity.project`, `github.environment`, `state.bucket`, `state.lock`, `rollout`, `secrets.required`, `live.<service>`, `dns.zone`, `stores.<storeId>`. Providers: `lib/status/providers/`; registered stores add `validate()` checks.

## Credentials files

Operator credentials load in a fixed order ([lib/utils/env-files.ts](lib/utils/env-files.ts)): `backend/.env`, then the repo-root `.env` (existing environment variables win over both), then **`infra/.env.<mode>`**, which OVERRIDES the ambient env so a staging run cannot inherit production values. The mode file holds a live secret key and the Pulumi passphrase; the CLI tightens it to `0600` on sight. Day-2 only: privileged rituals (bootstrap, migrations) use session-ephemeral shell exports and delete temporary env files afterwards.

## Teardown

**Teardown** (menu action) prompts for a transient bootstrap-grade key (`SCW_TEARDOWN_*` env for unattended runs), requires typing `<slug>-<mode>`, and runs `pulumi destroy --refresh` under the stack lock; production resources marked `protect: true` are refused until protection is lifted in code. Walkthrough: [Teardown](../cella/DEPLOYMENT.md#teardown).

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
| **bootstrap** | One-time operator setup of state storage and credentials; not VM boot. |
| **boot runner** | The `infra-boot` container run at first boot ([boot/](boot/)): hydrate, pull, migrate, start compose, report. |
| **boot plan** | JSON cloud-init writes for the boot runner: service, compose/env files, secrets, trace context. |
| **hydrate** | Write Secret Manager secrets to `/opt/app/.env.runtime` before the app starts. |
| **boot diagnostics** | Logs and JSONL events a VM uploads at boot; `infra diag` reads, `--replay` re-ships. |
| **internal route** | Private, ACL-guarded LB frontend: a stable in-network address across cutovers. |
| **engine config** | The injected app description ([config/engine-config.ts](config/engine-config.ts)); defaults to `appConfig`. |
