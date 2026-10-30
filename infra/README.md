# Infra CLI

**Move to EU cloud, keep the DX you know.**

### TL;DR

The EU has great cloud providers; what it lacks is an easy way to deploy within them.

Infra CLI sets up a full-stack app on European cloud provider [Scaleway](https://www.scaleway.com/), then deploys every release with zero downtime from a runner in that same account.

## Key features

**Go European without looking back.** Scaleway is one of Europe's most established cloud providers.

**Everything is yours.** Your Scaleway account runs the deploys too: a runner in it starts each one as a job, and GitHub holds no key.

**Full stack deployment.** One guided setup: domain, HTTPS, load balancer, managed database, file storage; the first deploy brings the servers.

**Releases can't break what is running.** Fresh servers per release.

**Secure by default.** No machine logins, and each key does one kind of work.

**Observable.** One record per deploy, read with a read-only key; an OpenTelemetry trace too when a sink key is set.

**Easy to leave.** Pulumi, Docker Compose and OTLP.

## How it works

**Setup** (`pnpm infra`) is a wizard that takes an empty Scaleway account to a provisioned environment in one sitting ([fresh installation](../cella/deployment/FRESH_INSTALLATION.md)).

**Release** is one command, which the environment's main job runs when the runner sees its target move:

```
pnpm --filter infra run deploy --mode <production|staging> --sha <sha>
```

It owns the whole pipeline, from building a missing release to removing the old machines.

**Manage** is the same `pnpm infra` on an existing stack: one menu to observe, change privileged resources, keys and secrets, reach the database, repair and tear down. Every action also runs alone as `pnpm infra <action>`, listed by `pnpm infra help`. There is no unattended mode: a change needs a person at the prompt.

## Core philosophy

Three rules:

1. **Create-then-replace.** A release never mutates a running server: each deploy provisions a new immutable **generation** per service, moves LB traffic once it provably serves the expected version, then destroys the displaced one.
2. **Content-addressed identity.** A generation id hashes the release SHA plus static config: a re-run is a no-op and a manual `pulumi up` cannot start a competing generation.
3. **Least-privilege keys.** Each key does one kind of work and is found by its name, never by a stored id.

## Security boundaries

- **The deploy path reads; it does not rule.** A deploy reads its environment's runtime secrets, and writes no IAM, database instance, VPC, DNS, bucket policy or secret of the app's. Its walls stand at the edges of its [zone](../cella/deployment/KEYS.md#zones), none inside.
- **A person writes identities.** IAM changes only at an Owner moment, with an Owner API key that ends within a day: a durable one is refused. Every other privileged run takes the operator key.
- **Each machine reads its own secrets.** A service's folder holds its own copy of every secret it consumes, only its machine key reads it, and the deploy writes that key into the cloud-init of the machines that run the service.
- **Buckets deny by default**, the Owner's key included, and a leaked deploy key cannot delete a versioned bucket's history.
- **Builds hold no key where the app's code runs.**

## Observability

Every deploy writes a run record. With a telemetry sink, a deploy also exports an OpenTelemetry trace: every pipeline step is a span, and each machine's boot joins it. Seeding the sink's ingest key (`maple-secret-ingest-key`, sink in [config/telemetry.config.ts](config/telemetry.config.ts)) in **Manage runtime secrets** turns export on for deploys and for the machines whose services consume it ([config/runtime-secrets.config.ts](config/runtime-secrets.config.ts)); `OTEL_EXPORTER_OTLP_*` variables reach no deploy. The boot runner replaces every secret value it handled, and any URL userinfo, in its output, its telemetry and every upload.

## Status command

`infra status` is a read-only health check of the whole lifecycle. Menu: `pnpm infra` → **Show status**; standalone:

```
pnpm --filter infra status [--mode <production|staging>] [--json]
```

Without `--mode` it reads `INFRA_MODE`, else the first stack file it finds, production first. `--json` emits the versioned contract below; a breaking shape change bumps `schemaVersion`.

Each check reports `ok | warn | missing | error | unknown`. `unknown` means "could not be evaluated", never a failure: a check that needs a Scaleway key degrades without one, so the command always completes. `nextAction` is the highest-priority pending step with an exact command.

The **inventory** checks compare what exists with what the environment declares, as an Owner checks after a suspected break-in: undeclared applications, keys and policies, a person's key without an end date, a machine that is no active generation, a main job whose image, command, env or secret references changed. It reads the active generations from the control object, which the deploy key writes, so it finds what an intruder did not disguise. The observer key reads no machine or stack checkpoint, so `inventory.machines` and `state.pendingOperations` read with the operator key once a session holds it, and are `unknown` without it. **Rotate keys** replaces the environment's keys, the runner's included, deletes the others and prints the inventory; **Set up operator key** replaces the operator's; **Update identities** deletes a policy, or a machine key, beside the declared one. Remove anything else in the console once you know who made it.

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

Stable check `id`s:

- `config.stackState`, `identity.project`, `identity.keyAges`
- `inventory.applications`, `inventory.keys`, `inventory.policies`, `inventory.machines`, `inventory.mainJob`
- `state.bucket`, `state.lock`, `state.pendingOperations`, `rollout`
- `secrets.required`, `environments.lines`, `runs.last`, `live.<service>`, `live.components`
- `db.publicEndpoint`, `dns.zone`, `stores.<storeId>`

## Key files

`infra/.env.<mode>` holds the environment's Scaleway project (`SCW_PROJECT_ID`, written by setup) and the observer key (`SCW_OBSERVER_*`). It overrides the ambient environment, so a staging run cannot inherit production values, and the CLI keeps it at `0600`. A value may be a pointer, `keychain:<service>/<account>` or `op:op://…`, resolved on load from the OS keychain or the 1Password CLI. A bare `infra/.env` is never read.

The CLI reads no privileged key and no passphrase from a file or the environment, in any form: it drops `PULUMI_CONFIG_PASSPHRASE` and `SCW_OWNER_*` with a notice, so nothing on the machine can change infrastructure with nobody at the prompt. The operator key comes from the prompt, and the passphrase from Secret Manager with it.

## Extending

The engine is plain Pulumi plus the Scaleway SDK; no plugin framework. An app changes it through the registries in [config/](config/): services with their strategies and routes, sizing, the machine image, database and asset retention (`general.config.ts`), backing stores, runtime secrets, managed keys, app-wide env values (`env-suppliers.config.ts`), health, the frontend CSP and telemetry. [config/engine-config.ts](config/engine-config.ts) injects the app description, decoupling the engine from any one workspace. A status check is a provider in [lib/status/providers/](lib/status/providers/); a registered store adds its own through `validate()`.

An app is deployable with a Docker image per service, a `/health` endpoint reporting the `X-App-Version` release SHA, and a one-shot `migrate` companion.

| Path | Holds |
| --- | --- |
| [config/](config/) | The app-owned registries above |
| [cli/](cli/) | The menu and its actions |
| [resources/](resources/) | The Pulumi program |
| [tasks/](tasks/README.md) | The deploy's steps and the operator tasks |
| [lib/](lib/) | What they share |
| [compose/](compose/) | The Compose model, assembled from the service registry into `compose.gen.yml` |
| [boot/](boot/) | The boot runner |
| [caddy/](caddy/) | The frontend's Caddy image and its Caddyfile |
| [runner/](runner/) | The runner's program |
| [scripts/](scripts/) | The gate that keeps app knowledge out of the engine's code |
| [tests/](tests/README.md) | Tests that span modules, and their helpers |
| [environments](environments) | What each environment deploys |
| [runner.json](runner.json) | The runner's project, release and environments |

## Vocabulary

One name per concept across code and docs:

| Term | Meaning |
| --- | --- |
| **mode** | `production` or `staging`; also the Pulumi stack name. |
| **release** | One git SHA baked into images and generations. |
| **deploy** | One run of the deploy command. |
| **blocked** | How a run ends when an operator owes something first: an identity update, an apply or a required secret. |
| **runner** | The app's small machine that starts a deploy when an environment's target moves. |
| **main job** | An environment's Serverless Jobs definition; each of its runs is one deploy. |
| **run record** | A deploy's record and log in the boot-diag bucket, read by `pnpm infra runs`. |
| **builder** | A machine a deploy makes to build a release not built yet, deleted after. |
| **rollout** | The two-wave fleet-moving phase of a deploy. |
| **generation** | One immutable service VM at one content-addressed `genId`. |
| **wave** | One stack update's services, cut over concurrently; 1 = primary, 2 = the rest. |
| **cutover** | Moving a service's LB traffic to its new generation: expand, health-gate, contract, drain. |
| **promote / reap** | Mark a generation `active` in the control object / destroy a displaced one. |
| **control object** | `control/<stack>.json` in the state bucket: which generation each service runs. |
| **stack lock** | `control/<stack>.lock.json`: the lock that lets one deploy or operator action run at a time. |
| **setup / bootstrap** | The first-ever `pnpm infra` run for a stack: state storage, identities, base infrastructure; not VM boot. |
| **Owner moment** | A run that writes IAM, with your own Owner API key made for the occasion. |
| **operator key** | The `<app>-operator` key for privileged work: no IAM write, accepted from your dedicated IP address only. |
| **observer key** | The read-only `<app>-observer` key, from any address; kept in `infra/.env.<mode>`. |
| **deploy key** | An environment's `<slug>-<mode>-ci-deploy` key, which its main job deploys with. |
| **privileged** | A resource only an apply on the operator key changes. |
| **boot runner** | The `infra-boot` container run at every boot ([boot/](boot/)): hydrate, pull, migrate, start compose, report. |
| **boot plan** | JSON cloud-init writes for the boot runner: service, compose/env files, secrets, trace context. |
| **hydrate** | Write Secret Manager secrets to `/opt/app/.env.runtime` before the app starts. |
| **boot account** | The boot log a VM uploads to the boot-diag bucket at the end of every boot. |
| **internal route** | A private, ACL-guarded LB frontend to a service's `internalPort` listener: an address that survives cutovers and no public pool reaches. |
| **engine config** | The app description [config/engine-config.ts](config/engine-config.ts) injects; defaults to `appConfig`. |
