# Changing infrastructure

This document explains how privileged infrastructure changes are reviewed and applied, and how pull requests find the ones still owed.

### TL;DR

Everything Pulumi manages is privileged: the database, the network with its reserved addresses, the load balancer with
its pools, buckets, secrets and DNS change only through an apply on your operator key, after you have seen its plan. An
apply also publishes the engine every deploy runs, with the description of the app it applied. A deploy makes and
deletes the machines and changes none of it. Every pull request says which applies merging owes.

## Privileged changes

**Privileged** resources are the ones only an apply on your operator key changes, which is all the Pulumi program holds:

- the database, the VPC and the private network
- each machine role's two reserved addresses, and the security groups its machines are made in
- the load balancer with its pools, their servers and their health checks: enabling a service with a load balancer route, or a change of `singleVM`, takes an apply first
- buckets and their policies
- secret containers and their versions
- DNS records
- the main job's definition, the engine image it runs and the applied description (`control/<mode>/applied.json`)

Identities are IAM, written at an Owner moment ([Identities](#identities)). To apply, `pnpm infra` → **Review & apply changes** (`pnpm infra apply`):

1. Builds the engine image from your checkout's tracked files and pushes it to the environment's registry on your operator key. Your machine needs Docker with buildx, able to build linux/amd64 (Docker Desktop and OrbStack are). Until the `up` names the image, no run starts from it, and a plan you decline deletes it again.
2. Shows the plan: what differs between the code and the live resources, drift made outside Pulumi included, the main job's new image among them, and asks once whether to apply it. Answering no applies nothing.
3. On a yes, applies the plan. Running machines stay in place: no machine is a resource of the program. If another apply ran meanwhile, you see the new plan and confirm again.
4. Records the engine it published in `applied.json`, under the lease and failing the apply when it cannot, then deletes the engine images older than the two before it: the registry holds the image the main job runs and the two published before it, which a run started before the apply may still pull. It verifies the result live (the declared database privileges exist) and starts a target whose last run ended blocked or apply needed. A mismatch of privileges fails the run; `pnpm infra --debug-provider` keeps the engine and provider log under `infra/.debug/`.

When an identity differs from the declared ones, the apply stops before changing anything and names **Update identities**. `pnpm infra preview` shows the same plan without the question and changes nothing at all, for a script or a look that must never apply.

A deploy reads what the last apply made, the reserved addresses by their tags and the pools by their names, and stops with "an apply makes it" when something it needs is missing. A change a deploy does not need, a bucket policy say, waits for the next apply, which an engine change that owes one names in its alignment.

## What needs an apply

A deploy runs the engine the last **Review & apply changes** built, and holds every release against the description that engine carries: every registry under [config/](../../infra/config), the engine's fields of the app config (domain, origin, buckets, enabled services, `singleVM`), the boot plan's contract version, and the Node, pnpm and repository the root `package.json` names. The agent a machine runs is built from the release and its boot plan written by the applied engine, so a change to what the agent reads from a machine's user data, the boot plan or the manifest, bumps `supportedSchemaVersion` in [infra/agent/src/plan.ts](../../infra/agent/src/plan.ts): such a release ends apply needed until its engine is applied. A release whose description is the applied one deploys without an apply. One that changes it ends **apply needed** until an apply from a checkout that has the change publishes it, and that apply starts it again ([Apply needed](./RUNBOOKS.md#apply-needed)). A release that changes only the engine's code (`infra/lib`, `infra/tasks`, `infra/resources`) deploys on the applied engine, and its own engine runs from the next apply on. The database access actions and the seed run an `up` that keeps the main job's image, and refuse to run while no apply has published one, as that `up` would delete the main job.

## Pull request check

Every pull request gets the keyless `privileged-changes` check. Its summary names what merging owes: **Update identities** for an application or a policy that is new, gone or changed, an apply for a resource of the program or a change of the applied description. It fails only when the head cannot render, and it reads code only, so drift made outside Pulumi shows in an apply's plan and not here.

## Changing a secret

**A value reaches machines with the machines a deploy makes.** A machine keeps the env file it fetched at its first boot, and a reboot runs it again, so a secret removed by an Apply stays on the running machines until a deploy replaces them, and a value set in **Manage runtime secrets** reaches a machine only through a new one: the next release, or **Rotate secrets**. The deploy composes each new machine's env file from the runtime folder, and ends blocked on a `required` value that is missing.

## Identities

An environment declares two identities: the deploy key's application, and, where a service signs uploads (`s3Access` in [config/services.config.ts](../../infra/config/services.config.ts)), the uploads application, whose policy reaches the objects of the upload buckets. No machine and no builder has one: they fetch and write through links the deploy key signs. Toggling `enabled` or `singleVM`, or a runtime secret's consumers, therefore changes no identity.

They are IAM, so only an Owner moment writes them: the setup, then **Update identities** (`pnpm infra identity`) after an upgrade that changes a declared policy, the deploy key's included. It makes the uploads application and its key, which it writes into the runtime folder, and deletes the retired machine identities (`<slug>-<mode>-vm-<service>`, `<slug>-<mode>-builder`) with their keys. It reads what differs with the observer key and asks for an Owner API key only when something has to change; an apply stops on identities that differ, a deploy does not read them. The plan also names a policy beside a declared one and a key beside the uploads key: **Update identities** deletes either; **Rotate keys** replaces both keys and deletes the rest.
