# Changing infrastructure

This document explains how privileged infrastructure changes are reviewed and applied, and how pull requests find the ones still owed. It assumes you know Pulumi: a program, the state of its stack, and the preview and `up` that change resources ([Pulumi docs](https://www.pulumi.com/docs/iac/concepts/)).

### TL;DR

Everything Pulumi manages, such as the database and the load balancer's pools, is privileged: it changes only through an apply on your operator key, after you have seen its plan. An apply also publishes the engine every deploy runs. A deploy only makes and deletes machines. Every pull request says which applies merging owes.

## Privileged changes

**Privileged** resources are the ones only an apply on your operator key changes. They are all the Pulumi program holds:

- the database, the VPC and the private network
- each machine role's two reserved addresses, and the security groups its machines are made in
- the load balancer with its pools, the addresses they list and their health checks
- buckets and their policies
- secret containers and their versions
- DNS records
- the main job's definition, schedule and engine image, and the applied description in `applied.json`

Identities are IAM, written at an Owner moment ([Identities](#identities)). To apply, `pnpm infra` → **Review & apply changes** (`pnpm infra apply`):

1. Builds the engine image from your checkout's tracked files and pushes it to the environment's registry on your operator key. No run starts from the image until the `up` names it.
2. Shows the plan, with drift made outside Pulumi and the main job's new image, and asks once whether to apply it. Answering no applies nothing.
3. On a yes, applies the plan. Running machines stay in place, as no machine is a resource of the program. If another apply ran meanwhile, you see the new plan and confirm again.
4. Records the engine it published in `applied.json`, and fails when it cannot. It records its description on GitHub for the release PR's check ([Pull request check](#pull-request-check)). It verifies that the declared database privileges exist, and a mismatch fails the run. `pnpm infra --debug-provider` keeps the engine and provider log under `infra/.debug/`. Last, it starts a target whose last run ended blocked or apply needed.

When an identity differs from the declared ones, the apply stops before changing anything and names **Update identities**. `pnpm infra preview` shows the same plan without the question and changes nothing. Use it for a script or a look that must never apply.

A deploy reads what the last apply made, and stops with "an apply makes it" when something it needs is missing. A change a deploy does not need, such as a bucket policy, waits for the next apply. An engine change that owes one names it in its alignment.

## What needs an apply

A deploy runs the engine the last **Review & apply changes** built. It holds every release against the description that engine carries:

- every registry under [config/](../../infra/config)
- the engine's fields of the app config: domain, origin, buckets, enabled services and `singleVM`
- the boot plan's contract version
- the Node, pnpm and repository the root `package.json` names

Three rules decide what a release owes:

- **Same description:** the release deploys without an apply.
- **Changed description:** it ends **apply needed** until an apply from a checkout with the change.
- **Engine code only:** a change to `infra/lib`, `infra/tasks` or `infra/resources` needs no apply.

The apply that publishes a changed description starts its release again ([Apply needed](./RUNBOOKS.md#apply-needed)). A release that changes only engine code deploys on the applied engine. Its own engine runs from the next apply on.

The database access actions and the seed run an `up` that keeps the main job's image. They refuse to run while no apply has published one, as that `up` would delete the main job.

## Pull request check

Every pull request gets the keyless `privileged-changes` check. Its summary names what merging owes. An application or a policy that is new, gone or changed owes **Update identities**. A resource of the program or a change of the applied description owes an apply.

A head that cannot render fails the check and blocks the merge. Drift made outside Pulumi shows in an apply's plan and not here, since the check reads code only.

On the release PR, the check also fails while the release describes the app otherwise than the last apply of an environment that follows the releases. That release merges only after its apply, since merging it first would end **apply needed**.

Each apply sets the repository variable `INFRA_APPLIED_DESCRIPTION_<MODE>` to its description's hash with your `gh`, since GitHub holds no key to read `applied.json`. The apply then runs a failed check of the open release PR again. An apply without `gh` prints the command that sets the variable.

## Identities

An environment declares two identities. One is the deploy key's application. The other, where a service sets `s3Access` in [config/services.config.ts](../../infra/config/services.config.ts), is the uploads application. Its policy reaches the objects of the upload buckets.

No machine and no builder has an identity, as they fetch and write through links the deploy key signs. No identity changes when you toggle `enabled` or `singleVM` or change a runtime secret's consumers.

Only an Owner moment writes identities, since they are IAM. A deploy does not read identities. The setup writes them first. **Update identities** (`pnpm infra identity`) writes them after an upgrade that changes a declared policy, the deploy key's included.

It makes the uploads application and its key, and writes that key into the runtime folder. It deletes the retired machine identities with their keys. It reads what differs with the observer key, and asks for an Owner API key only when something has to change.

The plan also names a policy beside a declared one, and a key beside the uploads key. **Update identities** deletes either. **Rotate keys** replaces the deploy and uploads keys and deletes the rest.
