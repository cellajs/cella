# Fresh installation

This document walks through setting up a cella app's first environment on Scaleway with the Infra CLI.

### TL;DR

A fresh install takes a domain, the Pulumi CLI and an Owner API key. The wizard writes the identities in one Owner
moment, then sets up state storage, the passphrase and the first infrastructure on the operator key it made. From then
on a runner deploys every release, and the first admin signs in with a magic link.

## How the CLI runs

`pnpm infra` launches the CLI ([cli/infra-cli.ts](../../infra/cli/infra-cli.ts)). Without a local `Pulumi.<stack>.yaml` it runs the install wizard. On an existing stack it opens one menu; a row that cannot run now stays listed with the reason. Esc steps back, Esc or `q` on the menu leaves, and after an action the menu returns (`--once` leaves instead). Every action also runs alone as `pnpm infra <action>`; `pnpm infra help` lists them. A fresh install defaults to **staging**. Production is the same wizard via `pnpm infra --mode production`. `--defaults` takes every optional default and prompts only for the keys; the admin email then comes from `INFRA_ADMIN_EMAIL`, or is set later in **Manage runtime secrets**. The CLI has no unattended mode: an action that changes infrastructure needs a person at the prompt, and a run without a terminal stops at its first question. `pnpm --filter infra status` shows the current state and next action.

## 1. Prerequisites

1. A domain, set as `appConfig.domain`, registered as external at https://console.scaleway.com/domains/external.
2. The Pulumi CLI, at least at the version of the `@pulumi/pulumi` package in `infra/package.json` (the main job installs exactly that version, and `pnpm infra` warns when yours is older):

   ```bash
   brew install pulumi/tap/pulumi
   ```

3. A Scaleway project per environment (optional): without `SCW_PROJECT_ID` in `infra/.env.<mode>`, the wizard picks or creates one (named after that environment's slug) and writes the id there. Every environment has a project of its own; the wizard does not offer the project of another environment.

## 2. Your Owner API key

1. Easiest: as an organization Owner, generate an [API key for your user](https://console.scaleway.com/iam/users) (User menu → API keys → Generate). Give it an expiry when it is only for this setup.
2. Or an Application in [IAM → Applications](https://console.scaleway.com/iam/applications) with **ProjectManager + IAMManager** on the organization, with a key that expires. Delete it after the setup: nothing fences a key that writes IAM, so none stays between Owner moments.
3. Keep project ID and organization ID in your password manager. The key serves the setup's Owner moment and **Set up the runner** (step 4); revoke it after that, as everything else runs on the operator key ([Operator key](./KEYS.md#operator-key)).

## 3. Run the infra CLI

```bash
pnpm infra
```

The first setup has two parts. The **Owner moment** writes IAM and nothing else, with the Owner API key you paste:

1. Picks or creates the Scaleway project (prerequisite 3).
2. Creates the machine identities (one application per registry service, the boot fetcher and the builder) and writes their policies ([Machine policies](./CHANGING_INFRASTRUCTURE.md#machine-policies)).
3. Creates the deploy application with its key, whose copy the operator part stores for the main job.
4. Makes sure the app's operator reaches this environment: an app without an operator gets it created (you give the dedicated address, and the key is shown once: store it); an app that has one gets this environment's project added to its policy, and its key keeps working ([Operator key](./KEYS.md#operator-key)).
5. Does the same for the app's observer, with the operator's address list, and writes its key to `infra/.env.<mode>` (`SCW_OBSERVER_*`) on this machine.
6. Offers to **revoke the Owner API key you pasted**. Decline when you set up the runner next (step 4): it needs the key again.

The **operator part** runs on the operator key: the one just created, or the one you paste.

1. Generates the Pulumi passphrase and stores it in Secret Manager with the stack's salt, so later runs fetch it with the operator key and nobody types it.
2. Asks for the admin email and, with it, the mail key. Both are optional here and can be set later in **Manage runtime secrets**.
3. Creates state storage and initializes Pulumi.
4. Optionally runs the first `pulumi up` (registry, database, network, the main job's definition, and the load balancer with its DNS records and certificates and empty pools, but no machine yet) and seeds the admin email. The first release is deployed like every other, by the runner (step 4) or `pnpm infra start-deploy`.

A second environment of the same app runs the same two parts: its Owner moment adds the environment to the operator's reach, and its operator part asks for the operator key you stored.

## 4. Let the runner deploy

1. Commit `infra/Pulumi.<mode>.yaml`, so other checkouts see the stack set up. Deploys do not need it: the main job writes the salt kept beside the passphrase.
2. **Set up the runner** for this environment (`pnpm infra runner-identity --mode <mode>`, your Owner API key): the app's first environment also makes the runner's project, its address and its key. Commit the `infra/runner.json` it writes.
3. **Replace the runner** (`pnpm infra runner-replace`, operator key). From then on the runner deploys the environment's target by itself; `pnpm infra runs` shows each run. `pnpm infra start-deploy` deploys at once, without waiting for it.

## 5. Revoke the setup key

If you pasted a key created for this setup, revoke it now. The Owner moment's last step covers it. If you declined or it failed:

1. Delete the key at [IAM → API Keys](https://console.scaleway.com/iam/api-keys).
2. Optionally delete the temporary application.

Day-2 privileged runs take the operator key, never this one.

## 6. Sign in as first admin

The one-shot `backend-release` companion (the migrate step of every boot of the primary machine) seeds a single admin when the users table is empty ([backend/src/main.migrate.ts](../../backend/src/main.migrate.ts), idempotent), from the **required** `admin-email` runtime secret (`ADMIN_EMAIL`). A deploy fails at "Verify runtime secrets are deliverable" while it is missing: set it in **Manage runtime secrets**, then `pnpm infra start-deploy`, as the runner does not start a failed target again.

1. Open the app and request a magic link for the admin email.
2. Sign in. If magic links do not arrive, seed the Brevo API key (or your email provider's) via **Manage runtime secrets**.
