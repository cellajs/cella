# Infra CLI

**Move to EU cloud, keep the DX you know.** 

### TL;DR

The EU has great cloud providers; what it lacks is an easy way to deploy within them.

Infra CLI makes is easy to set up a full-stack app on European cloud provider [Scaleway](https://www.scaleway.com/), then deploys every release with zero downtime through one CI-agnostic command.

## Key features

**Go European without looking back.** Deploy on Scaleway, one of the most established and feature-rich cloud providers in Europe.

**Everything is yours.** It all runs in your Scaleway account and in your action runner (Github Actions is used currently).

**Full stack deployment.** One guided setup has you covered: domain, HTTPS, load balancer, managed database, file storage, servers.

**Releases can't break what is running.** Every release starts on fresh servers and traffic only moves once the new version provably serves.

**Secure by default.** No need to log into a machine. Credentials descend in privilege (bootstrap → CI deploy → per-deploy VM keys), key rotation is a menu action.

**Observable by default.** Every deploy emits an OpenTelemetry trace with audit and error events; VMs report boot progress and crash logs to the same stream.

**Easy to leave.** The deploy is one command that happens to run in GitHub Actions; move it to any CI or a laptop. Underneath it is open, inspectable standards (Pulumi, Docker Compose, OTLP).

## How it works

Infra CLI has three workflows: **setup**, **release** and **manage**.

**Setup** (`pnpm infra`) is an interactive wizard that takes an empty Scaleway account to a live, TLS'd, health-checked app in one sitting. One console visit generates a bootstrap key; the wizard does the rest: it picks or creates the Scaleway project, creates state storage, generates the Pulumi passphrase, mints the credential chain, syncs GitHub Environment secrets, runs the first provision, and (with docker installed) finishes by running the first deploy from your machine. Fresh installs target staging first; production is the same wizard re-run with `--mode production`. The bootstrap key is used once and revoked by the wizard itself; see [cella/DEPLOYMENT.md](../cella/DEPLOYMENT.md#fresh-installation) for the step-by-step.

**Release** is one command, triggered by publishing a GitHub release (or manual dispatch, or any other CI):

```
pnpm --filter infra run deploy --mode <production|staging> --sha <sha> [--build]
```

The command owns the whole pipeline: preflights and the stack lock, frontend build + hashed-asset upload (concurrent with image availability), the base stack update, a two-wave rollout onto fresh VM generations, version verification, atomic frontend entry publish, and smoke checks. With `--build` it also bakes and pushes the images, which makes laptop and bring-your-own-CI deploys fully self-contained.

```
Release published
        ↓
images ready (CI matrix, or `--build` bakes them)
        ↓
Wave 1: provision + cut over the primary service (backend)
        ↓
Wave 2: one stack update provisions every remaining generation;
        cutovers run concurrently per service
        ↓
verify SHAs, publish frontend entry files, smoke checks
        ↓
one final stack update reaps every displaced generation
```

**Manage** is the same `pnpm infra` entrypoint on an existing stack: instead of the wizard it opens an operator menu for day-2 work. From there you re-sync config and GitHub Environment secrets (Resume), rotate the CI deploy key or the Pulumi passphrase, run a privileged `pulumi up` for protected infra (database, VPC, private network), preview drift, manage runtime secrets in Secret Manager (list, set, rotate, delete), run database actions (reset, seed, temporary public exposure), and clear a stale stack lock. See [cella/DEPLOYMENT.md](../cella/DEPLOYMENT.md#advanced-operations) for the step-by-steps.

## Core philosophy

Three design rules carry the model:

1. **Create-then-replace.** A release never mutates a running server. Each deploy provisions a new immutable **generation** per service, moves load-balancer traffic once the new generation provably serves the expected version, then destroys the displaced one. Rollback is a revert commit through the same forward path.
2. **Content-addressed identity.** A generation's id is a hash of the release SHA plus its static config, so re-running a deploy is a no-op and a manual `pulumi up` can never create a divergent generation identity. Rollout state lives in one S3 **control object** that both the deploy command and the Pulumi program read.
3. **Least-privilege credentials, per mode.** All principals are per app×mode (`<slug>-<mode>-…`), collected in one IAM group. The load-bearing boundary: **the CI key can never write IAM** — a single IAM-write action self-escalates to full admin (OWASP CICD-SEC-6 / NIST AC-6 territory), so identity administration stays a transient human action. The tiers:
   - **bootstrap key** — human-pasted, IAMManager-grade, used once per wizard/migration run and revoked at the end. Never standing.
   - **admin app** — the standing human principal: Object Storage `s3:*` (via bucket policies) + read-only on every infra surface, so `pulumi preview --refresh` and teardown work. No IAM write. Its key lives in Secret Manager (`admin-key`), never in git or GitHub.
   - **CI deploy app** — project-scoped writes for routine deploys; no IAM writes except one *conditioned* `IAMApplicationManager` rule (`resource.id in [service app ids]`) that lets it rotate service keys every deploy and provably nothing else.
   - **per-service VM apps + boot app** — each service VM signs with its own per-deploy key, path-conditioned to its own + shared secret folders (`resource.name.startsWith`). Cloud-init carries only the **boot key** (registry pull, boot-diag write, handoff read); the real service key arrives via a **single-access** Secret Manager bundle — a consumed bundle on first boot is an interception signal and halts the VM. Reboots reuse the on-disk cached pair.

   Bucket policies are deny-by-default for everyone not listed (including org admins — the org Owner can always edit/delete a bucket policy, that right is inherent). Uploads buckets are versioned and the CI statements exclude `s3:DeleteObjectVersion`, so a leaked CI key cannot destroy state history or user-data versions. Secret folders are the security boundary: `/<slug>-<mode>/<service>/`, `/shared/`, `/handoff/`, `/engine/` (engine credentials are unreadable from VMs).

## Observability

The deploy command opens an OTel trace; every pipeline step is a span, and audit events (`deploy.started`, `<service> promoted to generation <id>`, `deploy.failed`, ...) stream to the configured OTLP endpoint. Each VM's **boot runner** joins the same trace through the boot plan's `traceparent` and reports its boot phases and failures, including a crash-log tail. Independently of any backend, every VM also uploads its **boot diagnostics** (logs + the same events as JSONL) to a dedicated bucket: `pnpm --filter infra diag` reads them, `--replay` re-ships them to the telemetry backend. Configure the destination with `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_EXPORTER_OTLP_HEADERS`, or seed the `maple-secret-ingest-key` secret and the deploy picks it up automatically.

## Status command

`infra status` is a read-only health check across the whole lifecycle: tooling, credentials, stack state, GitHub Environment, the state bucket and lock, rollout pointers, live service versions, and DNS. It runs from the operator menu (`pnpm infra` → **Status**) or standalone:

```
pnpm --filter infra status [--mode <production|staging>] [--json]
```

Each check reports one of `ok | warn | missing | error | unknown`, where `unknown` means "could not be evaluated" (almost always a missing credential), never a failure: a check that needs Scaleway API access (`credential: "scaleway"`, satisfied by any operator or CI deploy key) degrades to `unknown` when no key is present, so the command always completes. The report's single `nextAction` is the highest-priority pending step, with an exact command to run.

`--json` emits a stable, versioned contract that apps, agents, and CI may depend on; a breaking shape change bumps `schemaVersion`.

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

Check `id`s are stable identifiers (`tooling.pulumi`, `config.stackState`, `identity.project`, `github.environment`, `state.bucket`, `state.lock`, `rollout`, `secrets.required`, `live.<service>`, `dns.zone`). The evaluator is a pure function of gathered facts, so the mapping from facts to verdicts is unit-tested in isolation.

## Teardown

There is no teardown command, on purpose. Destroying a stack is a rare, irreversible operation that needs owner-tier credentials the descending-privilege model deliberately keeps off laptops and out of CI — the CI deploy key can create but not delete the database or VPC, and the state-bucket policy denies it `DeleteBucket`. So you do it yourself, by hand, in the Scaleway console. See **Teardown** in [../cella/DEPLOYMENT.md](../cella/DEPLOYMENT.md) for the order.

## Extending

The engine is plain Pulumi + the Scaleway SDK; there is no plugin framework to learn. App-owned registries ([config/services.config.ts](config/services.config.ts), [config/runtime-secrets.config.ts](config/runtime-secrets.config.ts), [config/general.config.ts](config/general.config.ts)) declare services, sizing, routing, and secret wiring; resource modules under [resources/](resources/) are ordinary Pulumi programs you can read and change. The app description itself is injected through [config/engine-config.ts](config/engine-config.ts), which keeps the engine decoupled from any one workspace.

An app is deployable when it satisfies a small contract: a Docker image per service, a `/health` endpoint that reports the `X-App-Version` release SHA, and a one-shot `migrate` companion for schema changes.

## Vocabulary

One name per concept, used across code, tasks, and docs:

| Term | Meaning |
| --- | --- |
| **mode** | The deploy target: `production` or `staging`. The Pulumi stack name equals the mode. |
| **release** | The artifact identity being shipped: one git SHA, baked into images and generations. |
| **deploy** | One run of the deploy command: preflights, builds, stack updates, rollout, verification. |
| **rollout** | The fleet-moving phase inside a deploy, sequenced in two waves. |
| **generation** | One immutable VM of a service at one content-addressed `genId` (a hash of the release SHA plus the service's static config, its fingerprint). |
| **wave** | A batch of services provisioned in one stack update and cut over concurrently (wave 1 = the primary service, wave 2 = the rest). |
| **cutover** | Moving one service's LB traffic to its new generation: expand, health-gate, contract, drain. |
| **promote / reap** | Record a healthy generation as `active` in the control object / destroy a displaced generation. |
| **control object** | `control/<stack>.json` in the state bucket: per-service rollout state (`active`, `pendingSha`). |
| **stack lock** | The conditional-write sibling (`control/<stack>.lock.json`) that serializes deploys and operator actions per stack. |
| **bootstrap** | The one-time operator setup that creates state storage and the credential chain. Unrelated to VM boot. |
| **boot runner** | The `infra-boot` container every VM runs at first boot: hydrates secrets, pulls images, runs migrations, starts the compose stack, reports diagnostics. Source in [boot/](boot/). |
| **boot plan** | The JSON contract cloud-init writes for the boot runner: service, compose/env files, secret manifest, trace context. |
| **hydrate** | Fetch runtime secrets from Secret Manager and write `/opt/app/.env.runtime` on the VM before the app starts. |
| **boot diagnostics** | The logs and JSONL events a VM uploads to its dedicated bucket at boot, healthy or not; read with `infra diag`, re-ship with `--replay`. |
| **internal route** | A service's private, ACL-guarded LB frontend giving in-network consumers a stable address that follows every cutover. |
| **engine config** | The injected app description the engine deploys ([config/engine-config.ts](config/engine-config.ts)); defaults to the workspace `appConfig`. |
