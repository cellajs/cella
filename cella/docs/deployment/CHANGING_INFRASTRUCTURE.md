# Changing infrastructure

This document explains how privileged [Pulumi](https://www.pulumi.com/docs/iac/concepts/) changes are reviewed and applied, and how pull requests find the ones still owed.

### TL;DR

Everything Pulumi manages, such as the database and the load balancer's pools, is privileged: it changes only through an apply on your operator key, after you have seen its plan. An apply also publishes the deploy engine every deploy runs. A deploy only makes and deletes machines. Every pull request says which applies merging owes.

## Privileged changes

**Privileged** resources are the ones only an apply on your operator key changes. They are all the Pulumi program holds:

- the database, the VPC and the private network
- each machine role's two reserved addresses, and the security groups its machines are made in
- the load balancer with its pools, the addresses they list and their health checks
- buckets and their policies
- secret containers and their versions
- DNS records
- the main job's definition, schedule and engine image

To apply, `pnpm cella infra` → **Review & apply changes** (`pnpm cella infra apply`):

1. Builds the engine image from your checkout's tracked files and pushes it to the environment's registry on your operator key. No run starts from the image until the `up` names it.
2. Shows the plan, with drift made outside Pulumi and the main job's new image, and asks once whether to apply it. Answering no applies nothing.
3. On a yes, applies the plan. Running machines stay in place, as no machine is a resource of the program. If another apply ran meanwhile, you see the new plan and confirm again.
4. Records the engine it published in `applied.json`, with its description beside the hash, and fails when it cannot. It verifies that the declared database privileges exist, and a mismatch fails the run. `pnpm cella infra --debug-provider` keeps the engine and provider log under `cella/infra/.debug/`. Last, it starts a target whose last run ended blocked or apply needed.

When an identity differs from the declared ones, the apply stops before changing anything and names **Update identities**.

`pnpm cella infra preview` shows the same plan without the question and changes nothing. Use it for a script or a look that must never apply.

The database instance and its database are protected: a plan that would replace or delete either fails and names it, as a replace deletes the data before a successor exists. To replace one on purpose, run `pulumi state unprotect <urn>` before the apply. A teardown lifts the protection itself.

## What needs an apply

A deploy holds every release against the description of the app the last apply published:

- the app's [description.yml](../../infra/description.yml)
- the engine's fields of the app config: slugs, domain, origins, storage region, host, buckets and CDN URLs, each service's `enabled` and public URL, `singleVM` and backup days
- the proxy's header values: a change to the CSP builder, or to a config field it reads, owes an apply
- each derived secret's answer for a fixed input: a change to its function, or to what it calls, owes an apply
- the boot plan's contract version
- the Node, pnpm and repository the root `package.json` names

Three rules decide what a release owes:

- **Same description:** the release deploys without an apply.
- **Changed description:** it ends **apply needed** until an apply from a checkout with the change. The run names the changed fields, such as `services.search added`.
- **Engine code only:** a new `@cellajs/cli` that changes only the engine needs no apply. The release deploys on the applied engine, and its own engine runs from the next apply on.

The apply that publishes a changed description starts its release again ([Apply needed](./RUNBOOKS.md#apply-needed)). Before it builds, the apply compares this checkout's description with the waiting release's. When they differ it names the fields and asks before going on: that release would keep waiting.

A deploy reads what the last apply made, and stops with "an apply makes it" when something it needs is missing. A change a deploy does not need, such as a bucket policy, waits for the next apply. An engine change that owes one names it in its alignment.

The database access actions and the seed run an `up` that keeps the main job's image. They refuse to run while no apply has published one, as that `up` would delete the main job.

## Pull request check

The `lint` check of every pull request ends with a keyless step whose summary names what merging owes. An application or a policy that is new, gone or changed owes **Update identities**. A resource of the program or a change of the applied description owes an apply. A head that cannot render fails the check and blocks the merge.

The release PR, once ready for review, gets a second check, `release-applied`. It fails while the release describes the app otherwise than the last apply of an environment that follows the releases. That release merges only after its apply, since merging it first would end **apply needed**.

Each apply sets the repository variable `INFRA_APPLIED_DESCRIPTION_<MODE>` to its description's hash with your `gh`, since GitHub holds no key to read `applied.json`. An apply without `gh` prints the command that sets the variable.

## Identities

An environment declares two identities, the IAM applications its keys belong to. One is the deploy key's application. The other, where a service sets `s3Access` in [description.yml](../../infra/description.yml), is the uploads application. Its policy reaches the objects of the upload buckets.

No machine and no builder has an identity, as they fetch and write through links the deploy key signs. No identity changes when you toggle `enabled` or `singleVM` or change which services receive a runtime secret.

Only an Owner moment writes identities, since they are IAM. A deploy does not read identities. The setup writes them first. **Update identities** (`pnpm cella infra identities`) writes them after an upgrade that changes a declared policy, the deploy key's included. It reads what differs with the observer key, and asks for an Owner API key only when something has to change. On that key it:

- makes the uploads application and its key
- deletes a policy beside a declared one, and a key beside the uploads key, which its plan names
- makes the app's Transloadit application for an environment that stores a Transloadit auth key, and adds the environment's project to its policy; the upload buckets admit it at the next apply ([Transloadit key](./KEYS.md#transloadit-key))
