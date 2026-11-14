# Fresh installation

This document walks through setting up a cella app's first environment on Scaleway with the Infra CLI.

### TL;DR

A fresh install takes a domain, the Pulumi CLI, Docker and an Owner API key. The wizard follows a launch checklist. In one Owner moment it writes the identities and makes a one-day operator key, on which it sets up state storage, the recovery passphrase and the first infrastructure.

It commits the stack file and ends at the first deploy or at your first release. From then on the main job's schedule deploys every release, and the first admin signs in with a magic link.

## How the CLI runs

Without a local `Pulumi.<mode>.yaml`, `pnpm infra` runs the setup wizard. On a stack that is set up, `pnpm infra` opens on the home screen of the [Infra CLI](../../infra/README.md).

The wizard opens on the **launch checklist**: Tools, Repository, Domain, Sign in, Create, Connect, First release and First admin. Each step is ticked from what exists, and the first open one is marked. You can quit at any step: the next `pnpm infra` recommends **Resume setup**, which shows the checklist again and continues where the setup stopped.

A fresh install defaults to **production**. Staging is optional and billed apart, through the same wizard with `pnpm infra --mode staging`. `--defaults` takes every optional default. The admin email then comes from `INFRA_ADMIN_EMAIL`, and the setup stops when that holds no email address.

## 1. Prerequisites

1. A domain registered as external at https://console.scaleway.com/domains/external, set as `appConfig.domain`.
2. The Pulumi CLI, at least the version of `@pulumi/pulumi` in `infra/package.json`:

   ```bash
   brew install pulumi/tap/pulumi
   ```

3. Docker with buildx that builds linux/amd64 images, as Docker Desktop and OrbStack do. A Linux machine on another architecture needs QEMU's binfmt. Every apply builds the engine image the deploys run.
4. A Scaleway project per environment, optional. The wizard picks or creates one and writes its id to `infra/Pulumi.<mode>.yaml`. Each environment needs a project of its own.
5. A password manager, for the recovery passphrase the wizard shows once.
6. The root `package.json`'s `repository` set to the https URL of the app's repository. A new app from create-cella leaves it empty. Every deploy fetches its commit from there.
7. The GitHub CLI `gh`, signed in with access to the repository's variables. Every apply publishes its description there for the release PR's check.

The checklist's first rows check the domain, Pulumi, Docker buildx and the repository URL before anything is made.

## 2. Your Owner API key

1. Easiest: as an organization Owner, generate an [API key for your user](https://console.scaleway.com/iam/users) with an expiry of hours. The console path is User menu → API keys → Generate.
2. Or an Application in [IAM → Applications](https://console.scaleway.com/iam/applications) with **ProjectManager + IAMManager** on the organization, with a key that expires.

The key serves the setup's Owner moment, pasted once at the **Owner key** prompt. The CLI refuses a key without an expiry or with more than a day left. Later Owner moments, such as **Update identities** or **Rotate keys**, take a key made for the occasion. Everything else runs on the operator key.

## 3. Run the infra CLI

```bash
pnpm infra
```

The first setup has two parts. The **Owner moment** runs on the Owner API key you paste:

1. Picks or creates the Scaleway project.
2. Creates the deploy and uploads identities with their policies and keys, and stores the uploads key in the environment's `/runtime/` secret folder.
3. Lets the app's operators reach this environment. The app's first environment makes the `<app>-operator` application and the `<app>-operators` group, each with a policy.
4. Makes a one-day key of `<app>-operator` for the rest of this setup. The key stays in this run's memory. The CLI waits until Scaleway accepts it before the operator part uses it.
5. Does the same for the app's observer, and writes its read-only key to `infra/.env.<mode>` on this machine.
6. Offers to **revoke the Owner API key you pasted**, as nothing after the Owner moment needs it.

The **operator part** runs on the key step 4 made. When that key could not be made, it asks for one ([Operator key](./KEYS.md#operator-key)).

1. Generates the recovery passphrase, shows it once and waits until you confirm it is in your password manager. Later runs fetch it from Secret Manager. Your copy restores that one if it is lost.
2. Asks for the first account's admin email, which is required. The Brevo API key is optional here. **Env vars & secrets** sets it later.
3. Creates state storage and initializes Pulumi.
4. Offers the first apply: "Create the database, network and load balancer now?" A yes makes the database, the network, the load balancer with its DNS records and certificates, and the registry. It makes no machine yet. It then builds the engine image from your checkout and pushes it. A second `up` makes the main job on that image, with the schedule that starts its runs. It stores the values step 2 asked for.

A second environment of the same app runs the same two parts. Its Owner moment adds the environment to the operators' reach and makes its own one-day operator key. A setup of an environment torn down before runs in the project its teardown left in `infra/.env.<mode>`. It adopts what the teardown kept before its first apply ([Teardown](./RUNBOOKS.md#teardown)).

## 4. The first deploy

The setup goes on to connect the repository and ends at the first deploy:

1. **Connect.** It offers to commit `infra/Pulumi.<mode>.yaml` and push it, and prints each git command it runs. Other checkouts then see the stack set up, and a scheduled run reads `infra/environments` on the default branch. For staging, the same commit adds the line `staging branch:main` to `infra/environments`, naming your default branch. Without it no scheduled run deploys staging. Off the default branch, or when the push is refused, it says to open a pull request. The environment deploys once that merges.
2. **First release.** Production deploys the newest release, and a new repository has none. The setup then ends by asking you to publish the first release ([Releases](../RELEASES.md#setup)). The next scheduled run deploys it. Production with a release, and staging, are offered **Deploy now**. The CLI follows that deploy step by step until the app serves, or says whose side a failure is on.

A private repository needs its read key before any deploy ([Repository read key](./KEYS.md#repository-read-key)). Without it a run reads neither `infra/environments` nor the release tags. Decline the deploy, store the key with `pnpm infra repository-key`, then run **Deploy now**.

A step you declined is done by hand: commit and push the stack file and staging's line, or run `pnpm infra start-deploy`. From then on the first scheduled run after each change deploys the environment's target. **Deploy logs** shows each run. Revoke the Owner API key at [IAM → API Keys](https://console.scaleway.com/iam/api-keys) if the Owner moment did not, and delete a temporary application. Later sittings make a one-day operator key in the console ([Operator key](./KEYS.md#operator-key)).

## 5. Sign in as first admin

Every boot of the backend machine seeds one admin from the **required** `admin-email` runtime secret while the users table is empty. The setup stores the email you gave it. A deploy that finds the secret empty ends blocked before it makes any machine. Setting it in **Env vars & secrets** starts that deploy again.

1. Open the app and request a magic link for the admin email.
2. Sign in. If magic links do not arrive, store the API key of Brevo or your own email provider in **Env vars & secrets**. Its last entry imports a local `.env` file, for several values at once.

GitHub sign-in takes a GitHub OAuth app whose callback is exactly `<backendAuthUrl>/github/callback`. Turn wildcard matching off in its settings. An app whose single callback dates from before 3 August 2026 also accepts every path below it. GitHub could then send a code to another path of the API host.
