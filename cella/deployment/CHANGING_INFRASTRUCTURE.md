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

Identities are IAM, written at an Owner moment ([Machine policies](#machine-policies)). To apply, `pnpm infra` → **Review & apply changes** (`pnpm infra apply`):

1. Shows the plan: what differs between the code and the live resources, drift made outside Pulumi included, and asks once whether to apply it. Answering no applies nothing.
2. On a yes, applies the plan. Running machines and the load balancer stay in place. If a deploy ran meanwhile, you see the new plan and confirm again.
3. Verifies the result live: every machine and deploy identity holds exactly its declared grant, and the declared database privileges exist. A mismatch fails the run; `pnpm infra --debug-provider` keeps the engine and provider log under `infra/.debug/`.

When an identity differs from the declared ones, the apply stops before changing anything and names **Update identities**. `pnpm infra preview` shows the same plan without the question and changes nothing at all, for a script or a look that must never apply.

## Preflight

Every deploy runs the same plan first. A pending privileged change ends the run blocked before it builds anything, naming the apply, and the apply that clears it starts the target again. For load balancers and private networks, which the deploy key writes, this preflight is the only stop; the rest the deploy key cannot write at all.

## Pull request check

Every pull request gets the keyless `privileged-changes` check. Its summary names what merging owes before the next deploy: **Update identities** for an application or a policy that is new, gone or changed, an apply for a privileged resource. It never fails, and it reads code only, so drift made outside Pulumi shows in an apply's plan and not here.

## Removing a secret

**Deploy right after an Apply that removes a secret.** A machine boots from its own generation's secret list and fails its boot on a `required` secret it can no longer read. So when an Apply deletes a runtime secret, or narrows which secrets a machine key reads, an old machine that reboots before the deploy stays down until the deploy replaces it. A deployment that serves users keeps the old secret and the old consumer lists for one release, and removes them in the next.

## Machine policies

The machines' IAM applications and their policies follow the **service registry** ([config/services.config.ts](../../infra/config/services.config.ts)), not the enabled set: every registry service has an application whose policy reads its own secret folder, wherever it runs. Toggling `enabled` or `singleVM` therefore changes no identity. Neither does a change to a runtime secret's consumers, as each consumer keeps its own copy in its own folder.

They are IAM, so only an Owner moment writes them: the setup, then **Update identities** (`pnpm infra identity`) after a change to the registry. It reads what differs with the observer key and asks for an Owner API key only when something has to change. Until then the next deploy stops at "Verify identity grants".

A deploy also stops at "Stage machine keys" when an identity holds a key beside its standing one. **Update identities** deletes such a key; **Rotate keys** replaces every key and deletes the rest.
