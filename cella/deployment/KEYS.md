# Keys and rotation

This document explains the Scaleway API keys a deployment uses, how to rotate them, and what to do when one is lost.

### TL;DR

Every key does one kind of work: an Owner API key only for the moments that write IAM, an operator key that works
from your own address, a deploy key per environment, and a key per machine. No privileged key or passphrase sits in a
file on your machine. Rotating keys or secrets starts a deploy that replaces every machine.

## API keys

Every key is named after its bearer, the way the Scaleway console shows it.

| Key | Does | Works from | Lives in | Replaced by |
| --- | --- | --- | --- | --- |
| **Owner API key** (your own, as organization Owner) | Everything; the one key that writes IAM | Any address | Nowhere: typed at the prompt | Made per occasion with an expiry, revoked after |
| **Operator** (`<app>-operator`) | Every product in the app's projects, IAM read; no IAM write | Your dedicated address | Your password manager | **Set up operator key** |
| **Deploy** (`<slug>-<mode>-ci-deploy`) | One environment's machines, load balancers and private networks; reads the deploy folder, writes hand-over bundles | Any address | `deploy-key` in the engine folder | **Rotate keys** |
| **Observer** (`<app>-observer`) | Read-only on the app's projects and the state and boot-diag buckets | Your dedicated address | `infra/.env.<mode>` (`SCW_OBSERVER_*`) | **Rotate keys** |
| **Boot** (`<slug>-<mode>-boot`) | Image pulls, boot accounts, hand-over bundles | Any address | Each machine's cloud-init | **Rotate keys** |
| **Service** (`<slug>-<mode>-vm-<service>`) | Its own service's secret folder; the backend's buckets | Any address | The deploy folder, handed over read-once | **Rotate keys** |
| **Builder** (`<slug>-<mode>-builder`) | Image pushes and the release's frontend files | Any address | The deploy folder, handed over read-once | **Rotate keys** |
| **Runner** (`<app>-runner`) | Starts and reads the main job's runs | The runner's address | The runner's project and user data | `pnpm infra runner-identity --rotate-key` |

**Owner moments.** The CLI asks for an Owner API key only where IAM is written: a first setup, **Set up operator key**, **Set up the runner**, **Rotate keys**, **Update identities**, minting a managed key (a scoped key an app service reads, such as the AI worker's) and the identities part of **Tear down stack**. Keep the Owner account for recovery, with MFA.

**The observer** has one key per operator machine, which serves every environment there. **Update identities** on another machine, with your Owner API key, makes that machine its own.

**What the deploy path reaches.** The deploy key, the runner and the code a merge or a release puts there reach the environment's runtime secrets: the deploy key hands every new machine its key, and the runner can start the main job with a command of its own. The runner key can edit a job definition, as Scaleway has no permission set that only starts runs.

**What it cannot do.** The deploy key writes no IAM, database instance or backups, VPC, DNS, bucket configuration or policy, job definition or state history: those take the operator key or an Owner moment. It writes load balancers and private networks for a rollout, and only the deploy's preflight stops it from changing more of them. Of the buckets, it never reaches the private uploads bucket, and of the public one only `geoip/`. A deploy whose key policy differs from the declared one ([deploy-policy.ts](../../infra/lib/scaleway/deploy-policy.ts)) stops blocked.

**The Pulumi passphrase** encrypts the stack's secret outputs in the state bucket, the boot key among them. Nobody types it: the CLI reads it from the engine folder with your operator key, and the main job by reference. The main job writes the stack's salt into the stack file of the commit it deploys, so any commit decrypts the state, a release older than a passphrase rotation too.

On an operator machine `infra/.env.<mode>` holds the observer key and nothing a change needs: the CLI reads no privileged key and no passphrase from a file or the environment, so nothing on the machine changes infrastructure with nobody at the prompt.

### Secret folders

Secret Manager is split into folders per environment, and each key's policy names the folders it reads:

- `/<slug>-<mode>/<service>/`: a copy of every secret the service consumes, read by that service's key only. A change of consumers adds or removes copies and writes no IAM.
- `/<slug>-<mode>/deploy/`: what the deploy key reads: the machine keys it hands over, the repository read key and the telemetry ingest key.
- `/<slug>-<mode>/handoff/`: the read-once bundles a deploy writes for each new machine, read by the boot key only. A bundle already consumed at first boot halts the machine as a sign of interception.
- `/<slug>-<mode>/engine/`: the deploy key's copy, the passphrase with the stack's salt, and the database passwords, which no machine reads.

On a shared host the services read one env file, so they share their secrets; a key per service keeps IAM unchanged when placement changes.

### If a key is lost

| Key | Whoever holds it reaches | What you do |
| --- | --- | --- |
| Owner API key | Everything, IAM included, from every address | Revoke it in the console; then **Rotate keys** in each environment |
| Operator key | Every product and secret of the app's projects, from your dedicated address | **Set up operator key** (Owner API key), then **Rotate keys** and **Rotate secrets** in each environment |
| Observer key | Read-only views, from your dedicated address | **Rotate keys** replaces it |
| Deploy key | Its environment's runtime secrets, machines, load balancers and private networks, from any address | **Rotate keys**, then **Rotate secrets** |
| Runner key | Every served environment's deploy key and passphrase, from the runner's address | `pnpm infra runner-identity --rotate-key`, **Replace the runner**, then the deploy key's row in each environment |
| Builder key | Image pushes and frontend files of its environment | **Rotate keys**: the next deploy builds again |
| A machine's key | Its own service's secrets, on a shared host its neighbours' | **Rotate keys** |

## Operator key

`pnpm infra` → **Rotate keys & secrets** → **Set up operator key** (`pnpm infra operator-key`) runs once per app with your Owner API key (a first setup runs it for you), and again when your address changes. A new environment's setup adds it to the operator's policy. The action:

1. Asks for the dedicated IPv4 addresses the key works from; the default is the address this machine reaches the internet with.
2. Creates the `<app>-operator` application. Its policy keeps every project it reaches today, adds each environment set up on this machine, and holds every rule to those addresses. The name is production's slug, so staging and production share one operator.
3. Shows the new key once and waits until you confirm it is in your password manager.
4. Gives the observer the same addresses.
5. Tries the key from this machine until Scaleway accepts it.

From another address Scaleway refuses the key: IAM, Secret Manager and Object Storage answer with an error, while the database and Instances APIs answer a list with nothing in it. A stack that looks empty from a new address is therefore the address, not the stack.

Running it again replaces the policy and every earlier key, on your Owner API key, as the operator key writes no IAM, its own policy included.

**A new dedicated address** is set the same way, or by editing both policies, the operator's and the observer's, in the console; list the old address beside the new one to keep both. Scaleway applies a policy change within a few minutes, one API after the other, so a removed address can still work for a short while.

**How a session is unlocked.** The first action that changes something, or that needs the passphrase, asks for the operator key: access key and secret key. The CLI checks with IAM that the key belongs to the operator application, keeps it in memory until you quit, and runs every action of the run with it. When Scaleway refuses the key, the CLI says why: a secret key Scaleway does not know, or an address off the list.

## Repository read key

The main job, the builder and the runner fetch the target commit from the repository the root `package.json` names. A public repository needs nothing. A private one needs a read-only key in each environment before its first deploy:

1. Make a fine-grained GitHub token for that repository only, with **Contents: read** and nothing else, and an expiry.
2. Run `pnpm infra repository-key` on your operator key. It checks that the repository answers to the token, then stores it in the environment's deploy folder, and in the runner's project where the runner is set up.
3. Where the runner is set up, run **Replace the runner**, which gives the token to the runner machine.

The token goes as a header with each fetch, in no URL and no file the build sees. Run the action again to replace it before it expires; an empty answer removes it.

## Rotation

`pnpm infra` opens with the last rotation of each kind, and `status` lists every key's age; no age is a deadline. A rotation ends by starting the environment's target, and that deploy replaces every machine, also on the same release, so none keeps a key or a value from before. After a compromise, rotate keys first.

### Rotate secrets

**Rotate secrets** (`pnpm infra rotate-secrets`, operator key) sets a fresh password on every database role and a fresh value for every generated secret marked `rotatable` in [runtime-secrets.config.ts](../../infra/config/runtime-secrets.config.ts), and rewrites every consumer's copy. The running machines keep the old values until the deploy replaces them, and the database refuses the new connections they open meanwhile.

A key that encrypts or hashes stored data (`data-encryption-key`, `pii-hash-secret`) is not rotatable here: a new value would leave that data unreadable or unmatched, so it needs a rotation in the app, with both keys at hand. Third-party keys are pasted anew in **Manage runtime secrets**, the passphrase in **Rotate passphrase**.

### Rotate keys

With an Owner API key and your operator key at hand, `pnpm infra` → **Rotate keys & secrets** → **Rotate keys** replaces the deploy key, the observer key, the builder key and every standing machine key, and deletes the old ones. The observer key is rewritten in every `infra/.env.<mode>` on this machine; each other machine that reads takes **Update identities** once.

The running machines booted with the deleted machine keys: until the deploy the rotation starts replaces them, a reboot cannot hydrate and the backend's presigned URLs fail. The rotation ends by printing the inventory: what exists beside what the environment declares. Revoke the Owner API key you pasted afterwards.

The runner key is the app's, across its environments: after a suspected compromise, run `pnpm infra runner-identity --rotate-key` (Owner API key), then `pnpm infra runner-replace`.

### Rotate passphrase

`pnpm infra` → **Rotate keys & secrets** → **Rotate passphrase**:

1. Verifies the current passphrase and generates a new one, shown once. Store it first.
2. Re-encrypts the stack with a fresh salt under the stack lock, and verifies that the result decrypts with the new passphrase.
3. Stores the new passphrase and salt in Secret Manager, where the operator key and the main job read them.
4. Reminds you to commit `infra/Pulumi.<stack>.yaml`, so other checkouts verify the new passphrase.

> Losing the current passphrase means existing secret outputs cannot be decrypted. There is no recovery. Keep your password-manager copy current.

## A stolen laptop

The laptop holds the observer key in `infra/.env.<mode>`, and perhaps your dedicated address, when that is a VPN on it.

1. From another machine, **Set up operator key** with an Owner API key, with a new address when the old one went with the laptop.
2. **Rotate keys** in each environment. It replaces the observer key, so each other machine that reads takes **Update identities** once.
3. When the laptop held your password manager: **Rotate passphrase** and **Rotate secrets** too.

## Someone leaves

The operator key is one per app, so a person who held it could read every secret of the app's projects.

1. **Set up operator key**, and hand the new key to the people who stay.
2. **Rotate keys**, then **Rotate secrets**, in each environment. `data-encryption-key` and `pii-hash-secret` do not rotate here ([Rotate secrets](#rotate-secrets)).
3. Remove the person from the Scaleway organization and from the repository.

## Retired admin application

Stacks set up before the observer have a `<slug>-<mode>-admin` application, and bucket policies that name it and shut the operator out: a bucket policy shuts out every principal it does not name, the Owner included.

The first apply on such a stack admits the operator with the admin key from its custody secret, then writes the program's policies, and **Update identities** deletes the admin application with its keys and custody secret. The CLI reads none of the admin key's old names in `infra/.env.<mode>` (`SCW_ADMIN_*`, `SCW_ACCESS_KEY`, `SCW_SECRET_KEY`, `SCW_STATE_*`) and says to remove them.
