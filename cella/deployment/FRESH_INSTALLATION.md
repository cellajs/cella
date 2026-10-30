# Fresh installation

This document walks through setting up a cella app's first environment on Scaleway with the Infra CLI.

### TL;DR

A fresh install takes a domain, a fixed IPv4 address, the Pulumi CLI and an Owner API key. The wizard writes the
identities in one Owner moment, then sets up state storage, the passphrase and the first infrastructure on the
operator key it made. From then on a runner deploys every release, and the first admin signs in with a magic link.

## How the CLI runs

Without a local `Pulumi.<mode>.yaml`, `pnpm infra` runs the install wizard; on an existing stack it opens the [Infra CLI](../../infra/README.md) menu. A fresh install defaults to **production**. Staging is optional and billed apart: the same wizard via `pnpm infra --mode staging`. `--defaults` skips every optional question, and the admin email then comes from `INFRA_ADMIN_EMAIL`.

## 1. Prerequisites

1. A domain, set as `appConfig.domain`, registered as external at https://console.scaleway.com/domains/external.
2. The Pulumi CLI, at least the version of `@pulumi/pulumi` in `infra/package.json`:

   ```bash
   brew install pulumi/tap/pulumi
   ```

3. A Scaleway project per environment (optional): without `SCW_PROJECT_ID` in `infra/.env.<mode>`, the wizard picks or creates one and writes its id there. Each environment needs a project of its own.
4. A fixed public IPv4 address to work from, such as an office line or a VPN exit, and a password manager. Scaleway accepts the operator key the wizard makes from that address only, and the key is shown once.
5. The root `package.json`'s `repository` set to the https URL of the app's repository, which create-cella leaves empty: every deploy fetches its commit from there.

## 2. Your Owner API key

1. Easiest: as an organization Owner, generate an [API key for your user](https://console.scaleway.com/iam/users) (User menu → API keys → Generate), with an expiry of hours.
2. Or an Application in [IAM → Applications](https://console.scaleway.com/iam/applications) with **ProjectManager + IAMManager** on the organization, with a key that expires.

The key serves the setup's Owner moment and **Set up the runner** (step 4). The CLI refuses a key without an expiry or with more than a day left. Later Owner moments, such as **Update identities** or **Rotate keys**, take a key made for the occasion; everything else runs on the operator key.

## 3. Run the infra CLI

```bash
pnpm infra
```

The first setup has two parts. The **Owner moment** runs on the Owner API key you paste:

1. Picks or creates the Scaleway project (prerequisite 3).
2. Creates the machine and deploy identities with their policies and keys, and stores each machine identity's standing key in the environment's `/deploy/` secret folder.
3. Lets the app's operator reach this environment. The app's first environment creates the operator for the dedicated address you give, and shows its key once: store it. A later one adds its project, and the key keeps working.
4. Does the same for the app's observer, whose read-only key works from any address, and writes that key to `infra/.env.<mode>` on this machine.
5. Offers to **revoke the Owner API key you pasted**. Decline when you set up the runner next (step 4): it needs the key again.

The **operator part** runs on the operator key: the one just created, or the one you paste.

1. Generates the Pulumi passphrase, shows it once and waits until you confirm it is in your password manager. Later runs fetch it from Secret Manager, and your copy restores that one if it is lost.
2. Asks for the admin email and the mail key, both optional here: **Manage runtime secrets** sets them later.
3. Creates state storage and initializes Pulumi.
4. Offers the first apply: the database, the network, the load balancer with its DNS records and certificates, and the main job the runner (step 4) starts, but no machine yet. It stores the values step 2 asked for.

A second environment of the same app runs the same two parts: its Owner moment adds the environment to the operator's reach, and its operator part asks for the operator key you stored.

## 4. Let the runner deploy

1. Commit `infra/Pulumi.<mode>.yaml`, so other checkouts see the stack set up. For staging, also commit the line `staging branch:main` in `infra/environments`: without it the runner deploys nothing there.
2. **Set up the runner** for this environment (`pnpm infra runner-identity --mode <mode>`, your Owner API key) and commit the `infra/runner.json` it writes.
3. Push or merge both commits to the default branch: the runner reads `infra/environments` there and fetches the commit `infra/runner.json` pins.
4. For a private repository, store its read key now (`pnpm infra repository-key`, [Repository read key](./KEYS.md#repository-read-key)): a run before **Set up the runner** gives the runner no copy.
5. **Replace the runner** (`pnpm infra runner-replace`, operator key). From then on the runner deploys the environment's target; `pnpm infra runs` shows each run, and `pnpm infra start-deploy` deploys at once.
6. For production, publish the first release ([Releases](../RELEASES.md#setup)): production deploys the newest release, and a new repository has none.
7. Revoke the Owner API key at [IAM → API Keys](https://console.scaleway.com/iam/api-keys) if the Owner moment did not, and delete a temporary application.

## 5. Sign in as first admin

Every boot of the backend machine seeds one admin from the **required** `admin-email` runtime secret while the users table is empty. Until that secret has a value, the first deploy ends blocked at "Verify runtime secrets are deliverable", before it makes any machine: setting it in **Manage runtime secrets** starts that deploy again.

1. Open the app and request a magic link for the admin email.
2. Sign in. If magic links do not arrive, seed the Brevo API key (or your email provider's) via **Manage runtime secrets**.
