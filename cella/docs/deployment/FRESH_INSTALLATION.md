# Fresh installation

This document walks through setting up a Cella app's first environment on [Scaleway](https://www.scaleway.com/en/docs/) with the [Infra CLI](../../infra/README.md).

### TL;DR

A fresh install takes a domain, the Pulumi CLI, Docker and an Owner API key. The wizard follows a launch checklist. In one Owner moment it writes the identities and makes a one-day operator key, on which it sets up state storage and the first infrastructure. It commits the stack file and ends at the first deploy or at your first release. From then on a schedule deploys every release, and the first admin signs in with a magic link.

## How the CLI runs

The setup wizard takes an environment from nothing to its first deploy. Without a local `Pulumi.<mode>.yaml`, `pnpm cella infra` runs it. On a stack that is set up, `pnpm cella infra` opens on the home screen.

The wizard opens on the **launch checklist**: Tools, Repository, Domain, Sign in, Create, Connect, First release and First admin. You can quit at any step: the next `pnpm cella infra` recommends **Resume setup**, which shows the checklist again and continues where the setup stopped.

A fresh install defaults to **production**. Staging is optional and billed apart: you set it up through the same wizard with `pnpm cella infra --mode staging`.

`--defaults` takes every optional default. The admin email then comes from `INFRA_ADMIN_EMAIL`, and the setup stops when that holds no email address.

## 1. Prerequisites

The checklist's first rows check the domain, Pulumi, Docker buildx and the repository URL before anything is made.

1. A domain registered as external at https://console.scaleway.com/domains/external, set as `appConfig.domain`.
2. The Pulumi CLI, at least the version of `@pulumi/pulumi` in `cella/package.json`:

   ```bash
   brew install pulumi/tap/pulumi
   ```

3. Docker with buildx that builds linux/amd64 images, as Docker Desktop and OrbStack do. Every apply builds the engine image, which holds the deploy engine every deploy runs. A Linux machine on another architecture needs QEMU's binfmt.
4. A Scaleway project per environment, optional. The wizard picks or creates one and writes its id to `cella/infra/Pulumi.<mode>.yaml`.
5. The root `package.json`'s `repository` set to the https URL of the app's repository, where every deploy fetches its commit. A new app from create-cella leaves it empty.
6. The GitHub CLI `gh`, signed in with access to the repository's variables, where every apply records its description for the release PR's check.

## 2. Your Owner API key

The key serves the setup's **Owner moment**, which writes the identities and their keys. You paste it once at the **Owner key** prompt. The CLI refuses a key without an expiry or with more than a day left. Later Owner moments, such as **Update identities** or **Rotate keys**, take a key made for the occasion.

1. Easiest: as an organization Owner, generate an [API key for your user](https://console.scaleway.com/iam/users) with an expiry of hours. The console path is User menu → API keys → Generate.
2. Or an Application in [IAM → Applications](https://console.scaleway.com/iam/applications) with **ProjectManager + IAMManager** on the organization, with a key that expires.

## 3. Run the infra CLI

```bash
pnpm cella infra
```

The first setup has two parts, one per key. The Owner moment runs on the Owner API key you paste:

1. Picks or creates the Scaleway project.
2. Creates the deploy and uploads identities with their policies and keys.
3. Lets the app's operators reach this environment.
4. Makes a one-day key of `<app>-operator` for the rest of this setup. The key stays in this run's memory.
5. Does the same for the app's observer, and writes its read-only key to `~/.config/<app>/observer.env` on this machine.
6. Offers to **revoke the Owner API key you pasted**, as nothing after the Owner moment needs it.

The **operator part** runs on the key step 4 made. When that key could not be made, it asks for one ([Operator key](./KEYS.md#operator-key)).

1. Asks for the first account's admin email, which is required. The Brevo API key is optional here. **Env vars & secrets** sets it later.
2. Creates state storage and initializes Pulumi.
3. Offers the first apply: "Create the database, network and load balancer now?" A yes makes the database, the network, the load balancer with its DNS records and certificates, and the registry. It makes no machine yet.

A second environment of the same app runs the same two parts. A setup of an environment torn down before runs in the project its teardown left in `cella/infra/.env.<mode>` ([Teardown](./RUNBOOKS.md#teardown)).

## 4. The first deploy

The setup goes on to connect the repository and ends at the first deploy:

1. **Connect.** It offers to commit `cella/infra/Pulumi.<mode>.yaml` and push it, and prints each git command it runs. For staging, the same commit adds the line `staging branch:main` to `cella/infra/environments`, naming your default branch. Without it no scheduled run deploys staging. Off the default branch, or when the push is refused, it says to open a pull request. The environment deploys once that merges.
2. **First release.** Production deploys the newest release, and a new repository has none. The setup then ends by asking you to publish the first release ([Releases](../RELEASES.md#setup)). The next scheduled run deploys it. Production with a release, and staging, are offered **Deploy now**.

A private repository needs its read key before any deploy ([Repository read key](./KEYS.md#repository-read-key)). Without it a run reads neither `cella/infra/environments` nor the release tags. Decline the deploy, store the key with `pnpm cella infra repository-key`, then run **Deploy now**.

You do a step you declined by hand: commit and push the stack file and staging's line, or run `pnpm cella infra deploy-now`. From then on the first scheduled run after each change deploys the environment's target. **Deploy logs** shows each run.

Revoke the Owner API key at [IAM → API Keys](https://console.scaleway.com/iam/api-keys) if the Owner moment did not, and delete an Application you made for it. At later sittings you make a one-day operator key in the console ([Operator key](./KEYS.md#operator-key)).

## 5. Sign in as first admin

The setup stores the email you gave it as the **required** `admin-email` runtime secret. Every boot of the backend machine seeds one admin from it while the users table is empty. Setting it in **Env vars & secrets** starts a blocked deploy again.

1. Open the app and request a magic link for the admin email.
2. Sign in. If magic links do not arrive, store the API key of Brevo or your own email provider in **Env vars & secrets**. **Import a .env file**, under **More**, sets several values at once, such as a file exported from another host.

For GitHub sign-in, you register a GitHub OAuth app whose callback is exactly `<backendAuthUrl>/github/callback`. Turn wildcard matching off in its settings. An app whose single callback dates from before 3 August 2026 also accepts every path below it. GitHub could then send a code to another path of the API host.
