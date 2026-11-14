# Infra CLI

This document describes the Infra CLI, built on [Pulumi](https://www.pulumi.com/docs/): its commands, status checks, files and vocabulary.

### TL;DR

The Infra CLI sets up a cella app on [Scaleway](https://www.scaleway.com/) in one guided sitting. Then it opens on a home screen that says whether the app serves and what to do next, above a menu by task. A schedule in the same Scaleway account deploys every release onto fresh machines. Every change to the foundation is an apply you review first, each key does one kind of work, and no machine a deploy makes holds the deploy key.

## What it does

`infra/` is the deploy engine that apps built from cella share through template upgrades. It has four parts:

- **Pulumi program:** the foundation, such as the network, the database and the main job with its schedule.
- **Deploy:** makes and deletes the machines through the Scaleway API.
- **Agent:** runs on every machine.
- **CLI:** an operator runs it on their own machine.

The engine names no app. What an app deploys lives in the registries under [config/](config/), which an upgrade merges like every other template file.

## How a release flows

**Setup** (`pnpm infra`) is a wizard that takes an empty Scaleway account to a provisioned environment in one sitting, along the launch checklist ([fresh installation](../cella/deployment/FRESH_INSTALLATION.md)).

**Apply** (`pnpm infra apply`) changes the foundation and publishes the **engine image**. That image holds the engine built from your checkout, with the **applied description** of the app. Every run of the main job starts from it.

**Deploy**: the main job's schedule starts a run at the cadence [config/general.config.ts](config/general.config.ts) sets per environment. When the environment's target has no run yet, that run deploys it with one command of the engine image:

```
pnpm --filter infra run deploy --mode <production|staging> --sha <sha> --retry <n>
```

It builds a release not built yet, switches every role to a machine of the release and deletes the old ones. A release whose own description of the app differs from the applied one ends **apply needed** and names the fields that differ. The apply from its checkout starts it again.

## Commands

`pnpm infra` opens the setup wizard on a fresh stack, at its launch checklist. On an existing stack it opens the home screen:

- what serves and since when
- how the last deploy went
- the database
- the security findings and anything else the checks flag
- **Up next**: the step it recommends, which leads the menu below

The menu lists its rows by task, each entered by its letter. A row with several actions opens a short pick:

| Group | Rows |
| --- | --- |
| Deploys | `d` Deploy now, `r` Releases & roll back, `l` Deploy logs, `s` Full status |
| Configure | `e` Env vars & secrets, `a` Infrastructure changes (Review & apply changes, Preview changes), `i` Update identities |
| Database | `p` Open DB access (and Seed database) or Close DB access, whichever applies; `x` Reset database |
| Account | `o` Operators & keys (Rotate keys, Rotate secrets, Set up operators, Set repository read key) |
| More | `u` Repair (Unlock, Resume setup, Remove from state), `t` Tear down |

Every action also runs alone as `pnpm infra <action> [--mode <production|staging>]`. `pnpm infra help` lists them. An action that changes something asks a person at the prompt. There is no unattended mode. Only the actions that run Pulumi need its CLI installed. The others, `status` and `runs` among them, work without it. Each run keeps `compose.gen.yml` current with the service registry and says so when it rewrote the file.

## Status

`infra status` is a read-only health check of the whole lifecycle. The home screen is its compact report: one line each for what serves, the last deploy, the database and the security findings, one per other check that is not ok, and the next step. Menu: `pnpm infra` → **Full status**, every check in one table. Standalone:

```
pnpm --filter infra status [--mode <production|staging>] [--json]
```

Without `--mode` it reads `INFRA_MODE`, else the first stack file it finds, production first. `--json` prints the report as JSON, shaped as [lib/status/types.ts](lib/status/types.ts) declares it.

Each check reports `ok | warn | missing | error | unknown`. `unknown` means "could not be evaluated", never a failure. The command always completes: a check that needs a Scaleway key degrades without one. `nextAction` is the highest-priority pending step with an exact command.

The **inventory** checks compare what exists with what the environment declares, as an Owner checks after a suspected break-in. They flag what nobody declared, such as an extra key or policy.

They also flag a person's key without an end date, a machine the live record does not name, and a main job whose image, command, schedule or env differs from the last apply.

They find only what an intruder did not disguise: they read the live machines from the live record, which the deploy key writes. `inventory.machines` needs the operator key and is `unknown` without it.

To clear what they flag:

- **Rotate keys** replaces the environment's keys and deletes the others.
- **Update identities** deletes a policy or key beside the declared one.
- **In the console,** delete a key of the operator application that outlives a day.
- **Anything else** goes in the console once you know who made it.

Stable check `id`s:

- `config.stackState`, `identity.project`, `identity.keyAges`
- `inventory.applications`, `inventory.keys`, `inventory.policies`, `inventory.machines`, `inventory.mainJob`
- `state.bucket`, `state.lock`
- `secrets.required`, `environments.lines`, `schedule.last`, `runs.last`, `live.<service>`, `live.components`
- `db.publicEndpoint`, `dns.zone`

## Key files

- `infra/.env.<mode>`: this machine's observer key, which overrides the ambient environment.
- `infra/Pulumi.<mode>.yaml`: the environment's Scaleway project, committed as `infra:projectId`.
- A bare `infra/.env`: never read.

The override keeps a staging run from inheriting production values. The CLI keeps the env file at `0600`.

The CLI drops `SCW_OWNER_*` from its environment with a notice. A one-day operator key comes from the prompt, or at a setup from its Owner moment.

## Add a service or a store

To add a service:

1. Add an entry to [config/services.config.ts](config/services.config.ts).
2. Set its `enabled` flag and ports under `services` in [shared/config/config.default.ts](../shared/config/config.default.ts).
3. Set its path prefix in [shared/src/config-builder/service-paths.ts](../shared/src/config-builder/service-paths.ts).
4. List it under each runtime secret it reads in [config/runtime-secrets.config.ts](config/runtime-secrets.config.ts).
5. Ship a Docker image that answers the health path of [config/health.config.ts](config/health.config.ts) with its release.
6. Run its migrations, if any, in a one-shot `release` step at its machine's boot.

[tests/unit/app-config-registry.test.ts](tests/unit/app-config-registry.test.ts) fails when the registry and the shared config disagree.

To add a store:

1. Write a provisioner file in [resources/stores/](resources/stores/) beside `postgres-managed.ts`.
2. Export it from `catalog.ts`.
3. Add an entry to [config/stores.config.ts](config/stores.config.ts).

Either change deploys after an apply, since every registry is part of the applied description.

## File map

| Path | Holds |
| --- | --- |
| [config/](config/) | The registries: services, general settings, runtime secrets, managed keys, stores, env suppliers, health and the frontend CSP. Also engine-config.ts, where the engine reads the app's config |
| [cli/](cli/) | The menu and its actions |
| [resources/](resources/) | The Pulumi program: the foundation, no machine |
| [tasks/](tasks/README.md) | The deploy's steps and the operator tasks |
| [lib/](lib/) | What they share |
| [compose/](compose/) | The Compose model, assembled from the service registry into `compose.gen.yml` |
| [agent/](agent/) | The agent every machine runs |
| [caddy/](caddy/) | The frontend's Caddy image and its Caddyfile |
| [Dockerfile](Dockerfile) | The engine image an apply builds |
| [tests/](tests/README.md) | Tests that span modules, and their helpers |
| [environments](environments) | What each environment deploys |

## Vocabulary

One name per concept across code and docs:

| Term | Meaning |
| --- | --- |
| **mode** | `production` or `staging`. Also the Pulumi stack name. |
| **release** | One git SHA baked into images and machines. |
| **release name** | How the CLI names a commit on screen: the release tag that points at it (`0.34.0`), else `<branch>@<short id>` for a branch head (`main@c19588d`), else the short id. |
| **deploy** | One run of the deploy command. |
| **blocked** | How a run ends when a required runtime value is missing, which an operator stores. The screen names the value it waits for and says **Env vars & secrets** stores it. |
| **apply needed** | How a run ends when its target describes the app otherwise than the applied description. The screen says the release changes the infrastructure and waits for your go, and Deploy logs names the fields. The apply from its checkout starts it again. |
| **unchanged** | How a run ends when every role served its target already, under the same retry counter and rotation. |
| **main job** | An environment's Serverless Jobs definition, with its schedule. Each of its runs deploys at most one target, on the engine image. |
| **scheduled run** | A run of the main job its schedule starts. Under the lease, it deploys the target when no run record names that target and retry counter. |
| **engine image** | The engine an apply builds from the operator's checkout and pushes to the environment's registry. The main job names it by digest. |
| **applied description** | The app as the engine image describes it: the engine config's fields, every registry in `config/`, the boot plan's contract version, the root `package.json`'s Node, pnpm and repository. `control/<mode>/applied.json` keeps it beside its hash. The image's stamp holds the hash. |
| **run record** | A deploy's record and log in the boot-diag bucket, read by `pnpm infra runs`. |
| **builder** | A machine a deploy makes to build a release not built yet, deleted after. It writes through links, holds no key and reports the release's own description. |
| **release archive** | An image of a release as `docker load` reads it, under `releases/<sha>/images/` of the boot-diag bucket, named with its digest in the release's manifest. |
| **env file** | One machine's `.env.runtime`, composed by the deploy from the runtime folder, fetched once through a link and kept on the machine. |
| **link** | A presigned Object Storage URL the deploy key signs: one call on one object, until it ends within the hour. |
| **role** | A kind of machine: a service with a machine of its own, or under `singleVM` the host, which carries every service. |
| **machine** | One server a deploy made for one release and one role, named `<slug>-<role>-<slot>`. Deleted with the release it runs. |
| **slot** | `a` or `b`: one of a routed role's two reserved addresses, which its pools list for good. A deploy boots on the slot that does not serve. |
| **switch** | Moving a role to its new machine: boot on the idle slot, wait until its pools serve it, record it, drain the old one, delete it. |
| **drain** | The order in a machine's manifest that makes its agent fail the load balancer's check, keeps its connections for the role's drain seconds, and stops its containers. |
| **agent** | `infra-agent`, the Compose service every machine runs ([agent/](agent/)): boots the release, answers the load balancer's check per service, drains. It replaces every secret value it handled, and any URL userinfo, in its output and its boot account. |
| **live record** | `control/<mode>/live.json` in the boot-diag bucket: per role the slot that serves, its machine, its commit, and the retry counter and rotation it was booted under. |
| **lease** | `control/<mode>/lock.json` beside it: one deploy or operator action at a time. |
| **setup / bootstrap** | The first-ever `pnpm infra` run for a stack: state storage, identities, base infrastructure. Not a machine's boot. |
| **launch checklist** | The steps of a setup: Tools, Repository, Domain, Sign in, Create, Connect, First release, First admin. Each is ticked from what exists and the first open one is marked. A stack not set up yet opens on it. |
| **Owner moment** | A run that writes IAM, with your own Owner API key made for the occasion. |
| **operator key** | A one-day key of the `<app>-operator` application, or of a member of the `<app>-operators` group, for privileged work: no IAM write. A setup's Owner moment makes the first. Later ones are made in the console at each sitting. |
| **observer key** | The read-only `<app>-observer` key, from any address. Kept in `infra/.env.<mode>`. |
| **deploy key** | An environment's `<slug>-<mode>-ci-deploy` key, which its main job deploys with. |
| **uploads key** | An environment's `<slug>-<mode>-uploads` key, which signs the backend's uploads and presigned URLs, kept in the runtime folder. |
| **privileged** | A resource only an apply on the operator key changes. |
| **boot plan** | JSON cloud-init writes for the agent: role, services, links, agent ports. No key and no secret value. |
| **manifest** | The `manifest` key of a machine's user data: its role, its release and the drain order, which the agent polls. |
| **boot account** | The boot log a machine uploads to the boot-diag bucket through its link at the end of its first boot. |
| **internal route** | A private, ACL-guarded LB frontend to a service's `internalPort` listener: an address that survives switches and no public pool reaches. |
| **engine config** | The app's config as the engine reads it, in [config/engine-config.ts](config/engine-config.ts): the shared `appConfig` of the mode, with the app's own slug. |
