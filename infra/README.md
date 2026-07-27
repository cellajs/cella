# Infra CLI

**Move to EU cloud, keep the DX you know.** 

### TL;DR

The EU has great cloud providers; what it lacks is an easy way to deploy within them.

Infra CLI makes is easy to set up a full-stack app on European cloud provider [Scaleway](https://www.scaleway.com/), then deploys every release with zero downtime through one CI-agnostic command. Everything runs in your GitHub and Scaleway accounts; there is no service in the middle.

## Key features

**Go European without looking back.** Deploy on Scaleway, one of the most established and feature-rich cloud providers in Europe.

**Everything is yours.** It all runs in your GitHub and Scaleway account.

**Full stack deployment.** One guided setup has you covered: domain, HTTPS, load balancer, managed database, file storage, servers.

**Releases can't break what is running.** Every release starts on fresh servers and traffic only moves once the new version provably serves.

**Secure by default.** No need to log into a machine. Credentials descend in privilege (bootstrap → CI deploy → VM reader), key rotation is a menu action.

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

**Manage** is the same `pnpm infra` entrypoint on an existing stack: instead of the wizard it opens an operator menu for day-2 work. From there you re-sync config and GitHub Environment secrets (Resume), rotate the CI and VM reader keys or the Pulumi passphrase, run a privileged `pulumi up` for protected infra (database, VPC, private network), preview drift, manage runtime secrets in Secret Manager (list, set, rotate, delete), run database actions (reset, seed, temporary public exposure), and clear a stale stack lock. See [cella/DEPLOYMENT.md](../cella/DEPLOYMENT.md#advanced-operations) for the step-by-steps.

Three design rules carry the model:

1. **Create-then-replace.** A release never mutates a running server. Each deploy provisions a new immutable **generation** per service, moves load-balancer traffic once the new generation provably serves the expected version, then destroys the displaced one. Rollback is a revert commit through the same forward path.
2. **Content-addressed identity.** A generation's id is a hash of the release SHA plus its static config, so re-running a deploy is a no-op and a manual `pulumi up` can never fork identity. Rollout state lives in one S3 **control object** that both the deploy command and the Pulumi program read.
3. **Descending-privilege credentials.** Three keys, each creating the next: a short-lived bootstrap key (password manager only), a project-scoped CI deploy key (GitHub Environment), and a read-only VM reader key (baked into servers). No privileged key lives on a laptop or a VM.

## Observability

The deploy command opens an OTel trace; every pipeline step is a span, and audit events (`deploy.started`, `<service> promoted to generation <id>`, `deploy.failed`, ...) stream to the configured OTLP endpoint. Each VM's **boot runner** joins the same trace through the boot plan's `traceparent` and reports its boot phases and failures, including a crash-log tail. Independently of any backend, every VM also uploads its **boot diagnostics** (logs + the same events as JSONL) to a dedicated bucket: `pnpm --filter infra diag` reads them, `--replay` re-ships them to the telemetry backend. Configure the destination with `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_EXPORTER_OTLP_HEADERS`, or seed the `maple-secret-ingest-key` secret and the deploy picks it up automatically.

## Extending

The engine is plain Pulumi + the Scaleway SDK; there is no plugin framework to learn. Fork-owned registries ([config/services.config.ts](config/services.config.ts), [config/runtime-secrets.config.ts](config/runtime-secrets.config.ts), [config/general.config.ts](config/general.config.ts)) declare services, sizing, routing, and secret wiring; resource modules under [resources/](resources/) are ordinary Pulumi programs you can read and change. The app description itself is injected through [config/engine-config.ts](config/engine-config.ts), which keeps the engine decoupled from any one workspace.

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
| **boot runner** | The `cella-boot` container every VM runs at first boot: hydrates secrets, pulls images, runs migrations, starts the compose stack, reports diagnostics. Source in [boot/](boot/). |
| **boot plan** | The JSON contract cloud-init writes for the boot runner: service, compose/env files, secret manifest, trace context. |
| **hydrate** | Fetch runtime secrets from Secret Manager and write `/opt/app/.env.runtime` on the VM before the app starts. |
| **boot diagnostics** | The logs and JSONL events a VM uploads to its dedicated bucket at boot, healthy or not; read with `infra diag`, re-ship with `--replay`. |
| **internal route** | A service's private, ACL-guarded LB frontend giving in-network consumers a stable address that follows every cutover. |
| **engine config** | The injected app description the engine deploys ([config/engine-config.ts](config/engine-config.ts)); defaults to the workspace `appConfig`. |

## Status

Built for and validated on cella's own staging environment end to end, with production rollout underway. Scaleway is the only provider and that is a deliberate scope choice, not a temporary gap. The standalone npm package (`infra init` against an existing repo) is planned; until then the package is consumed inside the cella monorepo. Design direction and roadmap live with the maintainers; start at [cella/DEPLOYMENT.md](../cella/DEPLOYMENT.md) to operate it today.
