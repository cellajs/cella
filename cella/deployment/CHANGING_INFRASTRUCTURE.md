# Changing infrastructure

This document explains how privileged infrastructure changes are reviewed and applied, and how deploys and pull requests find the ones still owed.

### TL;DR

A normal deploy ships most config changes. Privileged resources, such as the database, the VPC, buckets, secrets and
DNS, change only through an apply on your operator key, after you have seen its plan. Every deploy and every pull
request checks for privileged changes that are still owed.

## Privileged changes

Most config changes ship through a normal deploy, including toggling `appConfig.services.<slug>.enabled` for a service without a load balancer route (a routed one takes an apply first). **Privileged** resources (database, VPC, private network, buckets and their policies, secret containers and their versions, DNS records, the load balancer but its pools' servers, the main job's definition) are changed with your operator key: `pnpm infra` → **Review & apply changes** (or `pnpm infra apply`). The machines' IAM applications and policies are no part of it: they are written at Owner moments ([Machine policies](#machine-policies)). The apply:

1. Asks for the operator key, unless this run already has it, and fetches the passphrase with it. A stack whose bucket policies were written before the operator was admitted lets it in first ([The retired admin application](./KEYS.md#retired-admin-application)). Resources the program no longer declares but that stay live (machine policies, database roles, generated secret values) are taken out of the Pulumi state under the stack lock, a state-only edit, so the plan never shows them as deleted. Then shows the plan (`pulumi preview --diff --refresh`) with the operator key and asks once whether to apply it. Up to here nothing of the infrastructure changes, though the state and the bucket policies may have: answering no keeps it that way. `pnpm infra preview` is the look that changes nothing at all. The plan reads live state first, so drift made outside Pulumi shows up; a deploy stops while any privileged change in it is pending. A registry service whose IAM application does not exist yet is planned with an application id that is known after the apply, under a warning that names the application.
2. On a yes, runs on the operator key ([Operator key](./KEYS.md#operator-key)): it reaches the Scaleway provider via `SCW_*` env and the state side (login, lock, `up`) as `<access key>@<project id>`, and is never written to stack config. The operator key writes no IAM: an identity that differs from the declared ones (an application the service registry needs, a machine or deploy policy, a standing machine key) stops the apply before its `up`, with the list, and points at **Update identities**. An app without an operator application stops here and names **Set up operator key**.
3. Takes the stack lease (renewed while the run lasts, released on Ctrl-C; a lock left by a dead run lapses within minutes and the CLI waits for that), and reconciles the rollout pointers from live state.
4. Checks that the Pulumi state and the rollout pointers are the ones the plan was made on. When a deploy landed in between, or step 3 corrected a pointer, it shows the plan as it stands now and asks again.
5. Runs `pulumi up --refresh`, so the `up` corrects the same drift the plan showed, without setting `bootstrap:computeDeferred`: the running VMs and LB stay in place.
6. Verifies the result live: every VM, boot and CI principal holds exactly the declared grant, with the exact secret condition and project scope, and the declared database privileges exist. Pulumi reporting an update is not proof (one update was recorded in state while Scaleway kept the old rule), so a mismatch fails the run. `pnpm infra --debug-provider` keeps the engine and provider log of the `up` under `infra/.debug/` for such a case.
`pnpm infra preview` is the plan of step 1 without the question and without its state edits: for a script, or a look that must never reach an apply. The organization id comes from the key, through IAM.

## Preflight

The same preview runs as a **preflight** in every deploy, under the stack lock, before the build. It names any pending privileged change (a database privilege, the VPC) with the Apply command above, and the run ends blocked before it builds anything or changes a machine; the apply that clears it starts the target again. For the database, the VPC, DNS, IAM, jobs and a bucket's configuration the preflight is a courtesy and IAM is the boundary: the deploy key holds no right to them, whatever a target's code tries. For load balancers and private networks the preflight is the only stop.

## Pull request check

Every pull request also gets the `privileged-changes` check, which needs no key: the base and the head each render, under mocks, the identities and the privileged resources they declare for every environment with a stack file, and the job summary names what merging owes before the next deploy: **Update identities** for an application or a policy that is new, gone or changed, an apply for a privileged resource that is. It passes either way. It reads code only, so drift made outside Pulumi shows in the plan of an apply and not here.

## Removing a secret

**Deploy right after an Apply that removes a secret.** The running VMs keep the previous release until the next deploy replaces them. A VM boots from the secret list of its own generation and fails the boot on a `required` secret it can no longer read, so when an Apply deletes a runtime secret, or narrows which secrets a VM key reads, an old VM that reboots before the deploy stays down until the deploy replaces it. Run the deploy right after such an Apply. A deployment that serves users keeps the old secret and the old consumer lists for one release, and removes them in the next.

## Machine policies

The machines' IAM applications and their policies follow the **service registry** ([config/services.config.ts](../../infra/config/services.config.ts)), not the enabled set: every registry service has an application and a policy that reads its own folder, wherever it runs. A machine that carries several services, such as the `singleVM` host, receives one key per service, and each service's copies are read with its own key. Toggling `enabled` or `singleVM` therefore changes no identity. They are IAM, so neither the Pulumi program nor the operator key writes them: the setup writes them at its Owner moment, and **Update identities** (`pnpm infra identity`) writes them after a change to the registry. A change to a runtime secret's consumers writes none: each consumer keeps its own copy in its own folder, which its policy names already. Values that lived in a shared folder before are moved into the copies by the first apply, and the shared container is deleted. It reads what differs first, with the observer key, and asks for an Owner API key only when something has to change. Until then the next deploy stops at "Verify identity grants". A registry service that is not enabled keeps its application and its standing key, which no deploy hands over. The deploy's "Stage machine keys" step stops when any identity holds a key besides its standing one; **Update identities** deletes it.
