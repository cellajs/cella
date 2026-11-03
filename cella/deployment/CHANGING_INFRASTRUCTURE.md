# Changing infrastructure

This document explains how privileged infrastructure changes are reviewed and applied, and how deploys and pull requests find the ones still owed.

### TL;DR

A normal deploy ships most config changes. Privileged resources, such as the database, the VPC, buckets, secrets and
DNS, change only through an apply on your operator key, after you have seen its plan. Every deploy and every pull
request checks for privileged changes that are still owed.

## Privileged changes

**Privileged** resources are the ones only an apply on your operator key changes:

- the database, the VPC and the private network
- the machines' security groups
- buckets and their policies
- secret containers and their versions
- DNS records
- the load balancer, but not its pools' servers: enabling a service with a load balancer route takes an apply first
- the main job's definition

Identities are IAM, written at an Owner moment ([Identities](#identities)). To apply, `pnpm infra` → **Review & apply changes** (`pnpm infra apply`):

1. Shows the plan: what differs between the code and the live resources, drift made outside Pulumi included, and asks once whether to apply it. Answering no applies nothing.
2. On a yes, applies the plan. Running machines and the load balancer stay in place. If a deploy ran meanwhile, you see the new plan and confirm again.
3. Verifies the result live: the declared database privileges exist. A mismatch fails the run; `pnpm infra --debug-provider` keeps the engine and provider log under `infra/.debug/`.

When an identity differs from the declared ones, the apply stops before changing anything and names **Update identities**. `pnpm infra preview` shows the same plan without the question and changes nothing at all, for a script or a look that must never apply.

## Preflight

Every deploy runs the same plan first. A pending privileged change ends the run blocked before it builds anything, naming the apply, and the apply that clears it starts the target again. For load balancers and private networks, which the deploy key writes, this preflight is the only stop; the rest the deploy key cannot write at all.

## Pull request check

Every pull request gets the keyless `privileged-changes` check. Its summary names what merging owes before the next deploy: **Update identities** for an application or a policy that is new, gone or changed, an apply for a privileged resource. It fails only when the head cannot render, and it reads code only, so drift made outside Pulumi shows in an apply's plan and not here.

## Changing a secret

**A value reaches machines with the machines a deploy makes.** A machine keeps the env file it fetched at its first boot, and a reboot runs it again, so a secret removed by an Apply stays on the running machines until a deploy replaces them, and a value set in **Manage runtime secrets** reaches a machine only through a new one: the next release, or **Rotate secrets**. The deploy composes each new machine's env file from the runtime folder, and ends blocked on a `required` value that is missing.

## Identities

An environment declares two identities: the deploy key's application, and, where a service signs uploads (`s3Access` in [config/services.config.ts](../../infra/config/services.config.ts)), the uploads application, whose policy reaches the objects of the upload buckets. No machine and no builder has one: they fetch and write through links the deploy key signs. Toggling `enabled` or `singleVM`, or a runtime secret's consumers, therefore changes no identity.

They are IAM, so only an Owner moment writes them: the setup, then **Update identities** (`pnpm infra identity`) after an upgrade that changes a declared policy, the deploy key's included. It makes the uploads application and its key, which it writes into the runtime folder, and deletes the retired machine identities (`<slug>-<mode>-vm-<service>`, `<slug>-<mode>-builder`) with their keys. It reads what differs with the observer key and asks for an Owner API key only when something has to change. Until then a deploy ends blocked at "Check identities", its first step, which reads the same plan as the apply. Update identities starts no deploy: `pnpm infra start-deploy` or the next apply starts the blocked target. The plan also names a policy beside a declared one and a key beside the uploads key: **Update identities** deletes either; **Rotate keys** replaces both keys and deletes the rest.
