# Fresh installation

This document walks through setting up a cella app's first environment on Scaleway with the Infra CLI.

### TL;DR

A fresh install takes a domain, the Pulumi CLI, Docker and an Owner API key. The wizard writes the identities in one Owner
moment, then sets up state storage, the passphrase and the first infrastructure on a one-day operator key you make in
the console. From then on the main job's schedule deploys every release, and the first admin signs in with a magic link.

## How the CLI runs

Without a local `Pulumi.<mode>.yaml`, `pnpm infra` runs the install wizard; on an existing stack it opens the [Infra CLI](../../infra/README.md) menu. A fresh install defaults to **production**. Staging is optional and billed apart: the same wizard via `pnpm infra --mode staging`. `--defaults` skips every optional question, and the admin email then comes from `INFRA_ADMIN_EMAIL`.

## 1. Prerequisites

1. A domain, set as `appConfig.domain`, registered as external at https://console.scaleway.com/domains/external.
2. The Pulumi CLI, at least the version of `@pulumi/pulumi` in `infra/package.json`:

   ```bash
   brew install pulumi/tap/pulumi
   ```

3. Docker with buildx, able to build linux/amd64 images (Docker Desktop and OrbStack are; a Linux machine on another architecture needs QEMU's binfmt): every apply builds the engine image the deploys run.
4. A Scaleway project per environment (optional): the wizard picks or creates one and writes its id to `infra/Pulumi.<mode>.yaml`. Each environment needs a project of its own.
5. A password manager, for the Pulumi passphrase the wizard shows once.
6. The root `package.json`'s `repository` set to the https URL of the app's repository, which create-cella leaves empty: every deploy fetches its commit from there.

## 2. Your Owner API key

1. Easiest: as an organization Owner, generate an [API key for your user](https://console.scaleway.com/iam/users) (User menu → API keys → Generate), with an expiry of hours.
2. Or an Application in [IAM → Applications](https://console.scaleway.com/iam/applications) with **ProjectManager + IAMManager** on the organization, with a key that expires.

The key serves the setup's Owner moment. The CLI refuses a key without an expiry or with more than a day left. Later Owner moments, such as **Update identities** or **Rotate keys**, take a key made for the occasion; everything else runs on the operator key.

## 3. Run the infra CLI

```bash
pnpm infra
```

The first setup has two parts. The **Owner moment** runs on the Owner API key you paste:

1. Picks or creates the Scaleway project (prerequisite 4).
2. Creates the deploy and uploads identities with their policies and keys, and stores the uploads key in the environment's `/runtime/` secret folder.
3. Lets the app's operators reach this environment. The app's first environment makes the `<app>-operator` application and the `<app>-operators` group, each with a policy; a later one adds its project to both, and their keys keep working. No key is made: you make a one-day key of the application in the console when the operator part asks for it (IAM → Applications → `<app>-operator` → API keys → Generate API key, with an expiration).
4. Does the same for the app's observer, whose read-only key works from any address, and writes that key to `infra/.env.<mode>` on this machine.
5. Offers to **revoke the Owner API key you pasted**: nothing after the Owner moment needs it.

The **operator part** runs on the one-day operator key you paste ([Operator key](./KEYS.md#operator-key)).

1. Generates the Pulumi passphrase, shows it once and waits until you confirm it is in your password manager. Later runs fetch it from Secret Manager, and your copy restores that one if it is lost.
2. Asks for the admin email and the mail key, both optional here: **Manage runtime secrets** sets them later.
3. Creates state storage and initializes Pulumi.
4. Offers the first apply: the database, the network, the load balancer with its DNS records and certificates, and the registry, but no machine yet. Once that `up` made the registry, it builds the engine image from your checkout, pushes it and runs a second `up` that makes the main job on that image, with the schedule that starts its runs. It stores the values step 2 asked for.

A second environment of the same app runs the same two parts: its Owner moment adds the environment to the operators' reach, and its operator part asks for a one-day operator key. A setup of an environment torn down before runs in the project its teardown left in `infra/.env.<mode>` and adopts what it kept, the upload buckets, the boot-diag bucket and the keys that protect stored data, before its first apply ([Teardown](./RUNBOOKS.md#teardown)).

## 4. The first deploy

1. Commit `infra/Pulumi.<mode>.yaml`, so other checkouts see the stack set up. For staging, also commit the line `staging branch:main` in `infra/environments`: without it no scheduled run deploys staging.
2. Push or merge to the default branch: a scheduled run reads `infra/environments` there.
3. For a private repository, store its read key (`pnpm infra repository-key`, [Repository read key](./KEYS.md#repository-read-key)): without it a scheduled run reads neither the file nor the release tags.
4. For production, publish the first release ([Releases](../RELEASES.md#setup)): production deploys the newest release, and a new repository has none.
5. From then on the first scheduled run after each change deploys the environment's target; `pnpm infra runs` shows each run, and `pnpm infra start-deploy` deploys at once.
6. Revoke the Owner API key at [IAM → API Keys](https://console.scaleway.com/iam/api-keys) if the Owner moment did not, and delete a temporary application.

## 5. Sign in as first admin

Every boot of the backend machine seeds one admin from the **required** `admin-email` runtime secret while the users table is empty. Until that secret has a value, the first deploy ends blocked at "Check runtime secrets", before it makes any machine: setting it in **Manage runtime secrets** starts that deploy again.

1. Open the app and request a magic link for the admin email.
2. Sign in. If magic links do not arrive, seed the Brevo API key (or your email provider's) via **Manage runtime secrets**.
