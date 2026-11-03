# Infra CLI

This document describes the Infra CLI: what it does, its commands and status checks, the files it reads and its vocabulary.

### TL;DR

The Infra CLI sets up a cella app on [Scaleway](https://www.scaleway.com/) in one guided sitting and manages it from one menu. A runner in the same Scaleway account deploys every release onto fresh machines and deletes the old ones once the new ones serve. Every change to the foundation is an apply you review first, each key does one kind of work, and no machine holds a key.

## What it does

`infra/` is the deploy engine the apps built from cella share through template upgrades: a Pulumi program for the foundation (network, database, load balancer, buckets, secret containers, DNS and the main job), the deploy that makes and deletes the machines through the Scaleway API, the agent every machine runs, the runner that starts the deploys, and the CLI an operator runs on their own machine. The engine names no app: what an app deploys is in the registries under [config/](config/), which an upgrade merges like every other template file.

## How a release flows

**Setup** (`pnpm infra`) is a wizard that takes an empty Scaleway account to a provisioned environment in one sitting ([fresh installation](../cella/deployment/FRESH_INSTALLATION.md)).

**Apply** (`pnpm infra apply`) changes the foundation and publishes the **engine image**: the engine built from your checkout, with the **applied description** of the app, which every run of the main job starts from.

**Deploy**: when the runner sees an environment's target move, it starts a run of the main job, and the engine image runs one command:

```
pnpm --filter infra run deploy --mode <production|staging> --sha <sha>
```

It builds a release not built yet, switches every role to a machine of the release and deletes the old ones. A release whose own description of the app differs from the applied one ends **apply needed** before any value is read, and the apply from its checkout starts it again.

## Commands

`pnpm infra` opens the setup wizard on a fresh stack and the operator menu on an existing one: observe, change privileged resources, keys and secrets, reach the database, repair and tear down. Every menu action also runs alone as `pnpm infra <action> [--mode <production|staging>]`, and `pnpm infra help` lists them. An action that changes something asks a person at the prompt: there is no unattended mode. Each `pnpm infra` run first writes `compose.gen.yml` from the service registry.

## Status

`infra status` is a read-only health check of the whole lifecycle. Menu: `pnpm infra` → **Show status**; standalone:

```
pnpm --filter infra status [--mode <production|staging>] [--json]
```

Without `--mode` it reads `INFRA_MODE`, else the first stack file it finds, production first. `--json` prints the report as JSON, shaped as [lib/status/types.ts](lib/status/types.ts) declares it.

Each check reports `ok | warn | missing | error | unknown`. `unknown` means "could not be evaluated", never a failure: a check that needs a Scaleway key degrades without one, so the command always completes. `nextAction` is the highest-priority pending step with an exact command.

The **inventory** checks compare what exists with what the environment declares, as an Owner checks after a suspected break-in: undeclared applications, keys and policies, a person's key without an end date, a machine the live record does not name, a main job that runs another image than the digest the last apply recorded, or another command, env or secret references. It reads the live machines from the live record, which the deploy key writes, so it finds what an intruder did not disguise. The observer key reads no machine, so `inventory.machines` reads with the operator key once a session holds it, and is `unknown` without it. **Rotate keys** replaces the environment's keys, the runner's included, deletes the others and prints the inventory; a key of the operator application that outlives a day is deleted in the console; **Update identities** deletes a policy, or a key, beside the declared one, and the retired machine identities. Remove anything else in the console once you know who made it.

Stable check `id`s:

- `config.stackState`, `identity.project`, `identity.keyAges`
- `inventory.applications`, `inventory.keys`, `inventory.policies`, `inventory.machines`, `inventory.mainJob`
- `state.bucket`, `state.lock`
- `secrets.required`, `environments.lines`, `runs.last`, `live.<service>`, `live.components`
- `db.publicEndpoint`, `dns.zone`

## Deploy telemetry

With the telemetry sink's ingest key, a deploy exports an OpenTelemetry trace: every pipeline step is a span, and each machine's boot joins it. Storing the key (`maple-secret-ingest-key`, sink in [config/telemetry.config.ts](config/telemetry.config.ts)) in **Manage runtime secrets** turns export on for deploys and for the machines whose services consume it ([config/runtime-secrets.config.ts](config/runtime-secrets.config.ts)); `OTEL_EXPORTER_OTLP_*` variables reach no deploy. The agent replaces every secret value it handled, and any URL userinfo, in its output, its telemetry and every upload.

## Key files

`infra/.env.<mode>` holds this machine's observer key (`SCW_OBSERVER_*`); the environment's Scaleway project is committed in `infra/Pulumi.<mode>.yaml`, as `infra:projectId`. The file overrides the ambient environment, so a staging run cannot inherit production values, and the CLI keeps it at `0600`. A bare `infra/.env` is never read.

The CLI drops `PULUMI_CONFIG_PASSPHRASE` and `SCW_OWNER_*` from its environment with a notice. A one-day operator key comes from the prompt, and the passphrase from Secret Manager with it.

## Add a service or a store

A service is an entry in [config/services.config.ts](config/services.config.ts) (image, port, health status, replacement strategy, route, machine size, env and bindings), with its `enabled` flag and ports under `services` in [shared/config/config.default.ts](../shared/config/config.default.ts) and its path prefix in [shared/src/config-builder/service-paths.ts](../shared/src/config-builder/service-paths.ts): [tests/unit/app-config-registry.test.ts](tests/unit/app-config-registry.test.ts) fails when the two disagree. Each runtime secret it reads lists it in [config/runtime-secrets.config.ts](config/runtime-secrets.config.ts). The service ships a Docker image, answers the health path of [config/health.config.ts](config/health.config.ts) with the release it runs, and runs its migrations, if any, in a one-shot `release` step at its machine's boot. A store is a provisioner file in [resources/stores/](resources/stores/) beside `postgres-managed.ts`, exported from `catalog.ts`, and an entry in [config/stores.config.ts](config/stores.config.ts). Every registry is part of the applied description, so either change deploys after an apply.

## File map

| Path | Holds |
| --- | --- |
| [config/](config/) | The registries: services, general settings (machine image, database size, asset retention), runtime secrets, managed keys, stores, env suppliers, health, the frontend CSP and telemetry; and engine-config.ts, where the engine reads the app's config |
| [cli/](cli/) | The menu and its actions |
| [resources/](resources/) | The Pulumi program: the foundation, no machine |
| [tasks/](tasks/README.md) | The deploy's steps and the operator tasks |
| [lib/](lib/) | What they share |
| [compose/](compose/) | The Compose model, assembled from the service registry into `compose.gen.yml` |
| [agent/](agent/) | The agent every machine runs |
| [caddy/](caddy/) | The frontend's Caddy image and its Caddyfile |
| [runner/](runner/) | The runner's program |
| [Dockerfile](Dockerfile) | The engine image an apply builds |
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
| **applied description** | The app as the engine image describes it: the engine config's fields, every registry in `config/`, the boot plan's contract version, the root `package.json`'s Node, pnpm and repository. Its hash is in `control/<mode>/applied.json` and the image's stamp. |
| **run record** | A deploy's record and log in the boot-diag bucket, read by `pnpm infra runs`. |
| **builder** | A machine a deploy makes to build a release not built yet, deleted after; it writes through links, holds no key, and reports the release's own description. |
| **release archive** | An image of a release as `docker load` reads it, under `releases/<sha>/images/` of the boot-diag bucket, named with its digest in the release's manifest. |
| **env file** | One machine's `.env.runtime`, composed by the deploy from the runtime folder, fetched once through a link and kept on the machine. |
| **link** | A presigned Object Storage URL the deploy key signs: one call on one object, until it ends within the hour. |
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
| **manifest** | The `manifest` key of a machine's user data: its role, its release and the drain order, which the agent polls. |
| **boot account** | The boot log a VM uploads to the boot-diag bucket through its link at the end of its first boot. |
| **internal route** | A private, ACL-guarded LB frontend to a service's `internalPort` listener: an address that survives switches and no public pool reaches. |
| **engine config** | The app's config as the engine reads it, in [config/engine-config.ts](config/engine-config.ts): the shared `appConfig` of the mode, with the app's own slug. |
