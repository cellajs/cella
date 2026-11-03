# Infra CLI

**Move to EU cloud, keep the DX you know.**

### TL;DR

The EU has great cloud providers; what it lacks is an easy way to deploy within them. Infra CLI sets up a full-stack app on European cloud provider [Scaleway](https://www.scaleway.com/), then deploys every release with zero downtime from a runner in that same account.

## Key features

**Go European without looking back.** Scaleway is one of Europe's most established cloud providers.

**Everything is yours.** Your Scaleway account runs the deploys too: a runner in it starts each one as a job, and GitHub holds no key.

**Full stack deployment.** One guided setup: domain, HTTPS, load balancer, managed database, file storage; the first deploy brings the servers.

**Releases can't break what is running.** Fresh servers per release.

**Secure by default.** No machine logins, no key on a machine, and each key does one kind of work.

**Observable.** One record per deploy, read with a read-only key; an OpenTelemetry trace too when a sink key is set.

**Easy to leave.** Pulumi, Docker Compose and OTLP.

## How it works

**Setup** (`pnpm infra`) is a wizard that takes an empty Scaleway account to a provisioned environment in one sitting ([fresh installation](../cella/deployment/FRESH_INSTALLATION.md)).

**Apply** (`pnpm infra apply`) changes the foundation and publishes the **engine image**: the engine built from your checkout, with the **applied description** of the app, which every run of the main job starts from.

**Release** is one command, which the engine image runs in the environment's main job when the runner sees its target move:

```
pnpm --filter infra run deploy --mode <production|staging> --sha <sha>
```

It owns the whole pipeline, from building a missing release to removing the old machines. A release whose own description of the app differs from the applied one ends **apply needed** before any value is read, and the apply from its checkout starts it again.

**Manage** is the same `pnpm infra` on an existing stack: one menu to observe, change privileged resources, keys and secrets, reach the database, repair and tear down. Every action also runs alone as `pnpm infra <action>`, listed by `pnpm infra help`. There is no unattended mode: a change needs a person at the prompt.

## Core philosophy

Three rules:

1. **Create-then-replace.** A release never mutates a running server: each deploy makes a new machine per role on its idle slot, waits until the load balancer sees it healthy at the expected release, then drains and deletes the old one. Traffic moves by health: every pool lists both slots' reserved addresses for good, and no deploy edits one.
2. **The live record decides.** Which slot serves each role, with which commit, is written after every switch: a re-run of a deploy that served changes nothing, and Pulumi holds the foundation only.
3. **Least-privilege keys.** Each key does one kind of work and is found by its name, never by a stored id.

## Security boundaries

- **The deploy path reads; it does not rule.** A deploy reads its environment's runtime secrets, and writes no IAM, database instance, VPC, load balancer, reserved address, DNS, bucket policy, image, Pulumi state or secret of the app's. Its walls stand at the edges of its [zone](../cella/deployment/KEYS.md#zones), none inside.
- **A person writes identities.** IAM changes only at an Owner moment, with an Owner API key that ends within a day: a durable one is refused. Every other privileged run takes a one-day operator key, refused on the same rule.
- **No machine holds a key.** The deploy composes each machine's env file from the values its services consume and hands the machine links that end within minutes: to that file, to the release's archives, whose digests it refuses to differ, and to the upload of its boot account. Once the machine booted, the deploy takes the links off its user data and deletes the file.
- **Buckets deny by default**, the Owner's key included, and a leaked deploy key cannot delete a versioned bucket's history.
- **The builder holds no key.** It writes the release's archives and its reports through links, and the app's code runs there in containers that reach no machine metadata.
- **A target's code never runs beside the deploy key.** The main job runs the engine image an apply published, with the target, the retry counter, the deploy key and the project as its only values; the target's code runs on the builder and on its machines.

## Observability

Every deploy writes a run record. With a telemetry sink, a deploy also exports an OpenTelemetry trace: every pipeline step is a span, and each machine's boot joins it. Seeding the sink's ingest key (`maple-secret-ingest-key`, sink in [config/telemetry.config.ts](config/telemetry.config.ts)) in **Manage runtime secrets** turns export on for deploys and for the machines whose services consume it ([config/runtime-secrets.config.ts](config/runtime-secrets.config.ts)); `OTEL_EXPORTER_OTLP_*` variables reach no deploy. The agent replaces every secret value it handled, and any URL userinfo, in its output, its telemetry and every upload.

## Status command

`infra status` is a read-only health check of the whole lifecycle. Menu: `pnpm infra` → **Show status**; standalone:

```
pnpm --filter infra status [--mode <production|staging>] [--json]
```

Without `--mode` it reads `INFRA_MODE`, else the first stack file it finds, production first. `--json` emits the versioned contract below; a breaking shape change bumps `schemaVersion`.

Each check reports `ok | warn | missing | error | unknown`. `unknown` means "could not be evaluated", never a failure: a check that needs a Scaleway key degrades without one, so the command always completes. `nextAction` is the highest-priority pending step with an exact command.

The **inventory** checks compare what exists with what the environment declares, as an Owner checks after a suspected break-in: undeclared applications, keys and policies, a person's key without an end date, a machine the live record does not name, a main job that runs another image than the digest the last apply recorded, or another command, env or secret references. It reads the live machines from the live record, which the deploy key writes, so it finds what an intruder did not disguise. The observer key reads no machine, so `inventory.machines` reads with the operator key once a session holds it, and is `unknown` without it. **Rotate keys** replaces the environment's keys, the runner's included, deletes the others and prints the inventory; a key of the operator application that outlives a day is deleted in the console; **Update identities** deletes a policy, or a key, beside the declared one, and the retired machine identities. Remove anything else in the console once you know who made it.

```jsonc
{
  "schemaVersion": 3,
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
- `state.bucket`, `state.lock`
- `secrets.required`, `environments.lines`, `runs.last`, `live.<service>`, `live.components`
- `db.publicEndpoint`, `dns.zone`, `stores.<storeId>`

## Key files

`infra/.env.<mode>` holds this machine's observer key (`SCW_OBSERVER_*`); the environment's Scaleway project is committed in `infra/Pulumi.<mode>.yaml`, as `infra:projectId`. The file overrides the ambient environment, so a staging run cannot inherit production values, and the CLI keeps it at `0600`. A bare `infra/.env` is never read.

The CLI reads no privileged key and no passphrase from a file or the environment, in any form: it drops `PULUMI_CONFIG_PASSPHRASE` and `SCW_OWNER_*` with a notice, so nothing on the machine can change infrastructure with nobody at the prompt. A one-day operator key comes from the prompt, and the passphrase from Secret Manager with it.

## Extending

The engine is plain Pulumi plus the Scaleway SDK; no plugin framework. An app changes it through the registries in [config/](config/): services with their strategies and routes, sizing, the machine image, database and asset retention (`general.config.ts`), backing stores, runtime secrets, managed keys, app-wide env values (`env-suppliers.config.ts`), health, the frontend CSP and telemetry. [config/engine-config.ts](config/engine-config.ts) injects the app description, decoupling the engine from any one workspace. With every registry beside it, it is the applied description an apply publishes, so a change to any of them deploys after an apply. A status check is a provider in [lib/status/providers/](lib/status/providers/); a registered store adds its own through `validate()`.

An app is deployable with a Docker image per service, a `/health` endpoint reporting the `X-App-Version` release SHA, and a one-shot `migrate` companion. The agent answers the load balancer from that endpoint, on a port of its own per service.

| Path | Holds |
| --- | --- |
| [config/](config/) | The app-owned registries above |
| [cli/](cli/) | The menu and its actions |
| [resources/](resources/) | The Pulumi program: the foundation, no machine |
| [tasks/](tasks/README.md) | The deploy's steps and the operator tasks |
| [lib/](lib/) | What they share |
| [compose/](compose/) | The Compose model, assembled from the service registry into `compose.gen.yml` |
| [agent/](agent/) | The agent every machine runs |
| [caddy/](caddy/) | The frontend's Caddy image and its Caddyfile |
| [runner/](runner/) | The runner's program |
| [Dockerfile](Dockerfile) | The engine image an apply builds |
| [scripts/](scripts/) | The gate that keeps app knowledge out of the engine's code |
| [tests/](tests/README.md) | Tests that span modules, and their helpers |
| [environments](environments) | What each environment deploys |
| [runner.json](runner.json) | The runner's project, release and environments |

## Vocabulary

One name per concept across code and docs:

| Term | Meaning |
| --- | --- |
| **mode** | `production` or `staging`; also the Pulumi stack name. |
| **release** | One git SHA baked into images and machines. |
| **deploy** | One run of the deploy command. |
| **blocked** | How a run ends when a required runtime value is missing, which an operator stores. |
| **apply needed** | How a run ends when its target describes the app otherwise than the applied description; the apply from its checkout starts it again. |
| **unchanged** | How a run ends when every role served its target already, under the same retry counter and rotation. |
| **runner** | The app's small machine that starts a deploy when an environment's target moves. |
| **main job** | An environment's Serverless Jobs definition; each of its runs is one deploy, on the engine image. |
| **engine image** | The engine an apply builds from the operator's checkout and pushes to the environment's registry; the main job names it by digest. |
| **applied description** | The app as the engine image describes it: the engine config's fields, every registry in `config/`, the root `package.json`'s Node, pnpm and repository. Its hash is in `control/<mode>/applied.json` and the image's stamp. |
| **run record** | A deploy's record and log in the boot-diag bucket, read by `pnpm infra runs`. |
| **builder** | A machine a deploy makes to build a release not built yet, deleted after; it writes through links, holds no key, and reports the release's own description. |
| **release archive** | An image of a release as `docker load` reads it, under `releases/<sha>/images/` of the boot-diag bucket, named with its digest in the release's manifest. |
| **env file** | One machine's `.env.runtime`, composed by the deploy from the runtime folder, fetched once through a link and kept on the machine. |
| **link** | A presigned Object Storage URL the deploy key signs: one call on one object, until it ends within minutes. |
| **role** | A kind of machine: a service with a machine of its own, or under `singleVM` the host, which carries every service. |
| **machine** | One server a deploy made for one release and one role, named `<slug>-<role>-<slot>`; deleted with the release it runs. |
| **slot** | `a` or `b`: one of a routed role's two reserved addresses, which its pools list for good. A deploy boots on the slot that does not serve. |
| **switch** | Moving a role to its new machine: boot on the idle slot, wait until its pools serve it, record it, drain the old one, delete it. |
| **drain** | The order in a machine's manifest that turns its agent's answers to 503, keeps its connections for the role's drain seconds, and stops its containers. |
| **agent** | `infra-agent`, the Compose service every machine runs ([agent/](agent/)): boots the release, answers the load balancer's check per service, drains. |
| **live record** | `control/<mode>/live.json` in the boot-diag bucket: per role the slot that serves, its machine, its commit, and the retry counter and rotation it was booted under. |
| **lease** | `control/<mode>/lock.json` beside it: one deploy or operator action at a time. |
| **setup / bootstrap** | The first-ever `pnpm infra` run for a stack: state storage, identities, base infrastructure; not VM boot. |
| **Owner moment** | A run that writes IAM, with your own Owner API key made for the occasion. |
| **operator key** | A one-day key of the `<app>-operator` application, or of a member of the `<app>-operators` group, for privileged work: no IAM write, made in the console at each sitting. |
| **observer key** | The read-only `<app>-observer` key, from any address; kept in `infra/.env.<mode>`. |
| **deploy key** | An environment's `<slug>-<mode>-ci-deploy` key, which its main job deploys with. |
| **privileged** | A resource only an apply on the operator key changes. |
| **boot plan** | JSON cloud-init writes for the agent: role, services, links, agent ports, trace context; no key and no secret value. |
| **manifest** | The `manifest` key of a machine's user data: its role, its release and the drain order, which the agent reads every two seconds. |
| **boot account** | The boot log a VM uploads to the boot-diag bucket through its link at the end of its first boot. |
| **internal route** | A private, ACL-guarded LB frontend to a service's `internalPort` listener: an address that survives switches and no public pool reaches. |
| **engine config** | The app description [config/engine-config.ts](config/engine-config.ts) injects; defaults to `appConfig`. |
