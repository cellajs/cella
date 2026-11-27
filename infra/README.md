# Infra CLI

This document describes the Infra CLI, built on [Pulumi](https://www.pulumi.com/docs/): its commands, status checks, files and vocabulary.

### TL;DR

The Infra CLI sets up a cella app on [Scaleway](https://www.scaleway.com/) in one guided sitting. Then it opens on a home screen that says whether the app serves and what to do next, above a menu by task. A schedule in the same Scaleway account deploys every release onto fresh machines. Every change to the foundation is an apply you review first, each key does one kind of work, and no machine a deploy makes holds the deploy key.

## What it does

The deploy engine ships in [@cellajs/cli](https://github.com/cellajs/cella-cli/tree/main/src/infra), and an app takes a new engine as a version bump. It has four parts:

- **Pulumi program:** the foundation, such as the network, the database and the main job with its schedule.
- **Deploy:** makes and deletes the machines through the Scaleway API.
- **Agent:** runs on every machine.
- **CLI:** an operator runs it on their own machine.

The engine names no app. This folder is the app's part: its [description](#the-description), which an upgrade merges like every other template file, the stack files and the environment records. An app changes what it deploys here, without editing engine code.

## How a release flows

**Setup** (`pnpm cella infra`) is a wizard that takes an empty Scaleway account to a provisioned environment in one sitting, along the launch checklist ([fresh installation](../cella/docs/deployment/FRESH_INSTALLATION.md)).

**Apply** (`pnpm cella infra apply`) changes the foundation and publishes the **engine image**. That image holds the engine built from your checkout, with the **applied description** of the app. Every run of the main job starts from it.

**Deploy**: the main job's schedule starts a run at the cadence `general.schedule` in [description.yml](description.yml) sets per environment. When the environment's target has no run yet, that run deploys it with one command of the engine image:

```
pnpm --filter infra run deploy --mode <production|staging> --sha <sha> --retry <n>
```

It builds a release not built yet, switches every role to a machine of the release and deletes the old ones. A release whose own description of the app differs from the applied one ends **apply needed** and names the fields that differ. The apply from its checkout starts it again.

## Commands

`pnpm cella infra` opens the setup wizard on a fresh stack, at its launch checklist. On an existing stack it opens the home screen, which shows what serves and since when, then only what needs a person:

- a deploy that failed, waits or runs
- the database while it is open
- the security findings, by what they found
- any other check that found something

When nothing needs a person, the line on what serves says all checks pass. The step the checks recommend leads the menu below.

The menu lists the daily rows, most used first. Each row's command is a word of its name:

| Row | Command |
| --- | --- |
| Full status | `status` |
| Review & apply changes | `apply` |
| Env vars & secrets | `env` |
| Releases & roll back | `releases` |
| Deploy logs | `logs` |
| Open DB access or Close DB access, whichever applies | `db-open`, `db-close` |

**More** opens the pick of the rare actions, each with the key it needs:

| Heading | Actions |
| --- | --- |
| Deploys & changes | Deploy now, Preview changes |
| Keys & access | Rotate keys, Rotate secrets, Set up operators, Update identities, Set repository read key |
| Repair | Unlock, Resume setup, Remove from state |
| Database | Seed database, Reset database |
| Environment | Import a .env file, Tear down |

Reset database and Tear down open on what they delete and what they keep, before any key or typed confirmation.

Esc steps back one prompt, and from an action's first prompt or its list straight to the menu. An action that ends by itself keeps its output on screen under one **← Back to menu** row until you go back.

Every action also runs alone as `pnpm cella infra <action> [--mode <production|staging>]`. `pnpm cella infra help` lists them. An action that changes something asks a person at the prompt. There is no unattended mode. Only the actions that run Pulumi need its CLI installed. The others, `status` and `logs` among them, work without it. `pnpm cella infra compose` prints the Compose file a deploy renders from the description. `pnpm cella infra description --mode <production|staging>` prints what the engine of that environment reads of the app.

## Status

`infra status` is a read-only health check of the whole lifecycle. The home screen is its compact report. Menu: `pnpm cella infra` → **Full status**: each finding with what it names and what fixes it, the checks that could not be read, and the passing checks as one line per area. Standalone:

```
pnpm --filter infra status [--mode <production|staging>] [--json]
```

Without `--mode` it reads `INFRA_MODE`, else the first stack file it finds, production first. `--json` prints the report as JSON, shaped as [lib/status/types.ts](https://github.com/cellajs/cella-cli/blob/main/src/infra/lib/status/types.ts) declares it.

Each check reports `ok | warn | missing | error | unknown`. `unknown` means "could not be evaluated", never a failure. The command always completes: a check that needs a Scaleway key degrades without one. `nextAction` is the highest-priority pending step with an exact command.

The **inventory** checks compare what exists with what the environment declares, as an Owner checks after a suspected break-in. They flag what nobody declared, such as an extra key or policy.

They also flag a person's key without an end date, a machine the live record does not name, a volume no machine holds, and a main job whose image, command, schedule or env differs from the last apply.

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

- `~/.config/<app>/observer.env`: this machine's observer key, which every checkout and worktree of the app reads and no repository holds.
- `infra/.env.<mode>`: values of one environment on this machine, which override the ambient environment. It holds no key.
- `infra/Pulumi.<mode>.yaml`: the environment's Scaleway project, committed as `infra:projectId`.
- A bare `infra/.env`: never read.

The override keeps a staging run from inheriting production values. The CLI keeps the env file at `0600`.

The CLI drops `SCW_OWNER_*` from its environment with a notice. A one-day operator key comes from the prompt, or at a setup from its Owner moment.

## The description

[description.yml](description.yml) states what only a deployment knows: per service its machine size, how it is replaced and drained, its load balancer route and env; who makes each runtime secret and which services receive it; the database, the stores, the managed keys and the schedule.

Each service states its port, and its internal port and path prefix where it has them. Once the mode's `appConfig` loads, the engine refuses a value that differs from `appConfig.services` in `shared` and names both. A service `appConfig` does not know is not compared, and neither is the proxy's port: it is the container's own, where `appConfig` holds the dev server's. Under `singleVM` the host takes on every co-hosted worker's env except the variables `processIdentityEnv` lists, such as `SERVICE`, which pick the process a container runs.

A runtime secret is keyed by its variable. The engine makes one marked `generation: random`, and one with `derivedFrom` follows another secret through the function the file names. An operator sets every other.

A secret the engine generates states its stored name as `secretName`: renaming its variable then never renames the stored secret by accident. Any other secret's stored name is the variable in kebab-case unless it states one. A stored name never changes, since the secret's resources are named by it.

The engine checks the file at load and stops with the path of the key it refuses. The file holds no code of the app's: a store kind or an env value it cannot state becomes an engine field. A reference, `<path>#<export>`, names a file under `shared/` or `infra/` and an export of it. The frontend proxy's headers come from `frontendHeaders` in [frontend-csp.ts](../shared/src/config-builder/frontend-csp.ts), which the `frontend` service names.

To add a service:

1. Add an entry under `services` in [description.yml](description.yml), with its port and, behind a path route, its path prefix.
2. Set its `enabled` flag and the same ports under `services` in [shared/config/config.default.ts](../shared/config/config.default.ts).
3. Set the same path prefix in [shared/src/config-builder/service-paths.ts](../shared/src/config-builder/service-paths.ts).
4. Add it to the `services` of each runtime secret it reads.
5. Ship a Docker image that answers the health path of the engine's [health contract](https://github.com/cellajs/cella-cli/blob/main/src/infra/lib/health-contract.ts) with its release.
6. Run its migrations, if any, in a one-shot `release` step at its machine's boot.

To add a store:

1. A new kind of store is engine code: a provisioner in the engine's [resources/stores/](https://github.com/cellajs/cella-cli/tree/main/src/infra/resources/stores) and a `kind` the file accepts.
2. Add an entry under `stores` in [description.yml](description.yml).

Either change deploys after an apply, since the file is part of the applied description.

## File map

| Path | Holds |
| --- | --- |
| [description.yml](description.yml) | The [description](#the-description): services, runtime secrets, stores, managed keys, the database and the schedule |
| [environments](environments) | What each environment deploys |
| `Pulumi.yaml`, `Pulumi.<mode>.yaml` | The Pulumi project and each environment's stack file |
| [program.mjs](program.mjs) | The line Pulumi runs, which hands over to the engine's program |
| [tests/](tests/) | The app's checks of its own files against the engine: env schemas, docs, workflows, shared copies |

The engine's own files (the CLI, the Pulumi program, the deploy, the agent, the frontend proxy, the engine image) are in [cella-cli](https://github.com/cellajs/cella-cli/tree/main/src/infra/).

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
| **applied description** | The app as the engine image describes it: `description.yml`, the engine config's fields, the proxy's header values, each derived secret's answer for a fixed input, the boot plan's contract version, the root `package.json`'s Node, pnpm and repository. `control/<mode>/applied.json` keeps it beside its hash. The image's stamp holds the hash. |
| **run record** | A deploy's record and log in the boot-diag bucket, read by `pnpm cella infra logs`. |
| **builder** | A machine a deploy makes to build a release not built yet, deleted after. It writes through links, holds no key and reports the release's own description. |
| **release archive** | An image of a release as `docker load` reads it, under `releases/<sha>/images/` of the boot-diag bucket, named with its digest in the release's manifest. |
| **env file** | One machine's `.env.runtime`, composed by the deploy from the runtime folder, fetched once through a link and kept on the machine. |
| **link** | A presigned Object Storage URL the deploy key signs: one call on one object, until it ends within the hour. |
| **role** | A kind of machine: a service with a machine of its own, or under `singleVM` the host, which carries every service. |
| **machine** | One server a deploy made for one release and one role, named `<slug>-<role>-<slot>`. Deleted with the release it runs. |
| **slot** | `a` or `b`: one of a routed role's two reserved addresses, which its pools list for good. A deploy boots on the slot that does not serve. |
| **switch** | Moving a role to its new machine: boot on the idle slot, wait until its pools serve it, record it, drain the old one, delete it. |
| **drain** | The order in a machine's manifest that makes its agent fail the load balancer's check, keeps its connections for the role's drain seconds, and stops its containers. |
| **agent** | `infra-agent`, the Compose service every machine runs ([agent/](https://github.com/cellajs/cella-cli/tree/main/src/infra/agent)): boots the release, answers the load balancer's check per service, drains. It replaces every secret value it handled, and any URL userinfo, in its output and its boot account. |
| **live record** | `control/<mode>/live.json` in the boot-diag bucket: per role the slot that serves, its machine, its commit, and the retry counter and rotation it was booted under. |
| **lease** | `control/<mode>/lock.json` beside it: one deploy or operator action at a time. |
| **setup / bootstrap** | The first-ever `pnpm cella infra` run for a stack: state storage, identities, base infrastructure. Not a machine's boot. |
| **launch checklist** | The steps of a setup: Tools, Repository, Domain, Sign in, Create, Connect, First release, First admin. Each is ticked from what exists and the first open one is marked. A stack not set up yet opens on it. |
| **Owner moment** | A run that writes IAM, with your own Owner API key made for the occasion. |
| **operator key** | A one-day key of the `<app>-operator` application, or of a member of the `<app>-operators` group, for privileged work: no IAM write. A setup's Owner moment makes the first. Later ones are made in the console at each sitting. |
| **observer key** | The read-only `<app>-observer` key, from any address. Kept in `~/.config/<app>/observer.env`. |
| **deploy key** | An environment's `<slug>-<mode>-ci-deploy` key, which its main job deploys with. |
| **uploads key** | An environment's `<slug>-<mode>-uploads` key, which signs the backend's uploads and presigned URLs, kept in the runtime folder. |
| **Transloadit key** | The app's `<app>-transloadit` key, which only writes objects of the upload buckets. Kept in Transloadit's Template Credentials. |
| **privileged** | A resource only an apply on the operator key changes. |
| **boot plan** | JSON cloud-init writes for the agent: role, services, links, agent ports. No key and no secret value. |
| **manifest** | The `manifest` key of a machine's user data: its role, its release and the drain order, which the agent polls. |
| **boot account** | The boot log a machine uploads to the boot-diag bucket through its link at the end of its first boot. |
| **internal route** | A private, ACL-guarded LB frontend to a service's `internalPort` listener: an address that survives switches and no public pool reaches. |
| **engine config** | The engine's part of the mode's shared `appConfig`, which it reads from `shared`: the slugs, domain, origins, buckets, services, `singleVM` and backup retention. |
