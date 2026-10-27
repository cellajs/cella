# Keys and rotation

This document explains the Scaleway API keys a deployment uses, how to rotate them, and what to do when one is lost.

### TL;DR

Every key does one kind of work: an Owner API key only for the moments that write IAM, an operator key that works
from your own address, a deploy key per environment, and a key per machine. No privileged key or passphrase sits in a
file on your machine. Rotating keys or secrets starts a deploy that replaces every machine.

## API keys

Each Scaleway API key does one kind of work and lives in its own place. Every key is named after its bearer, the way the Scaleway console shows it.

**What the deploy path reaches.** An environment's deploy path is its deploy key, the runner and the code a merge or a release puts there. The deploy path reads that environment's runtime secrets: the deploy key hands every new machine its key, and the runner can start the main job with a command of its own, which then reads the deploy key. That is the model of every platform that states one: whoever can deploy can read what the deployed code reads. What the deploy key cannot do is the line IAM draws: write IAM, change the database instance or its backups, the VPC, DNS, a bucket's configuration or policy, or the main job's definition, or delete state history. Those take the operator key from your dedicated address, or an Owner moment. The deploy key does write load balancers and private networks, as a rollout moves pools and attaches machines; that a deploy changes nothing else of them is the preflight's rule, not IAM's. The runner key may edit job definitions: see its row below.

| Key | Permissions | Lifetime | Where stored |
| --- | --- | --- | --- |
| **Owner API key** (your own key as organization Owner) | Everything, from every address: Scaleway holds an Owner to no policy condition. The one key that writes IAM. The CLI asks for one where identities are made or removed: a first setup, **Rotate keys**, **Set up operator key**, **Set up the runner**, **Tear down stack** (its second part), minting a managed key, and **Update identities**. Nothing else runs on it: the buckets admit no person. | Create one for the occasion in the console, with an expiry of hours, and revoke it afterwards; the CLI names a key that writes IAM for longer. Keep the Owner account for recovery, with MFA. | Nowhere on the machine. The CLI takes it at the prompt and never reads `SCW_OWNER_*` from a file or the environment. |
| **Operator application key** (`<app>-operator`, one per app) | Every product in the projects of the app's environments, plus IAM read. It writes no IAM: a key that does cannot be held to its own app. Scaleway accepts it **from your dedicated IP address only**: every rule of its policy carries that condition. The key for day-to-day privileged work, the same one in every environment. | Long-lived. Created and replaced by `pnpm infra operator-key` with your Owner API key ([Operator key](#operator-key)). | Your password manager only: shown once, stored nowhere by the CLI. You paste it, access key and secret key, once per run of the CLI, which keeps it in memory until you quit. |
| **Deploy application key** (`<slug>-<mode>-ci-deploy`) | In the stack's project: machines set by set (servers, IPs, private NICs, volumes; a builder machine among them), block storage, IPAM, load balancers, private networks and object storage; **read-only** on the registry (the builder pushes the images), VPC, RDB and jobs (privileged resources). Secret Manager by folder ([deploy-policy.ts](../../infra/lib/scaleway/deploy-policy.ts)): it sees every container's metadata in the project (Scaleway refuses a list call under any condition); it writes in the hand-over folder only; it reads values in the deploy folder only, the machine keys among them, so through the machines it hands them to it reaches the environment's runtime secrets. IAM read. No IAM write and no DNS write: the records follow the load balancer's address, which the setup's first apply makes. A deploy whose key policy is not the declared one stops blocked. | Long-lived. Rotate via the CLI **Rotate keys** action ([Key rotation](#key-rotation)) | Its copy `deploy-key` in the engine folder (`/<slug>-<mode>/engine/`), which the main job's definition references; on no machine and in no file. |
| **Observer application key** (`<app>-observer`, one per app) | Read-only, set by set, in the projects of the app's environments: instances, load balancers, databases, networks, registry, DNS, secret metadata (no value), jobs, object storage reads; plus IAM read. Of the buckets, only the state bucket and the boot-diagnostics bucket admit it, to read. Scaleway accepts it from your dedicated address only, as the operator key. The key for `status`, the plan of an identity update, and an agent that reads for you. | Long-lived. Made at an Owner moment: a first setup, or **Update identities** on a machine without one; **Rotate keys** replaces it. | `infra/.env.<mode>` as `SCW_OBSERVER_ACCESS_KEY` / `SCW_OBSERVER_SECRET_KEY` (0600, never committed). One key serves every environment: an Owner moment writes it into each env file on the machine that holds one. |
| **Boot + service application keys** (`<slug>-<mode>-boot`, `<slug>-<mode>-vm-<service>`) | Boot key: registry pull + boot-diag write + handoff-only secret read. Service key: path-conditioned secret read of its own folder, which holds a copy of every secret the service consumes. The backend additionally gets granular S3 object sets. | One standing key per identity, made at an Owner moment (a first setup, **Update identities** when one is missing, **Rotate keys** for all of them). A deploy hands it over and writes no IAM; it stops when an identity holds any other key. On a shared host every container reads the one env file, so the services there share their secrets; a key per service keeps IAM still when placement changes. | `/<slug>-<mode>/deploy/machine-key-<service>` in Secret Manager, which the deploy key reads. The boot key is baked into machine cloud-init; each service key reaches its machine through a single-access handoff bundle, one per service the machine carries. Not in stack config. |
| **Runner application key** (`<app>-runner`, one per app) | Serverless Jobs in the projects of the environments it serves: it starts and reads the main job's runs, and it may edit a job definition, as Scaleway has no set that starts runs only. A start can replace the command, and a run reads what its definition references, so the runner reaches the deploy key and the passphrase of every environment it serves. Scaleway accepts it from the runner's reserved address only. | Long-lived. Made by **Set up the runner** with your Owner API key; `--rotate-key` replaces it, then **Replace the runner** gives the machine the new one. | `/runner/runner-key` in the runner's project, which **Replace the runner** puts into the runner machine's user data. |
| **Builder application key** (`<slug>-<mode>-builder`) | Registry push and object writes in the project; of the buckets, only the frontend bucket admits it, to list and write the release's files (it deletes none). | One standing key, made at the Owner moments that make the machine keys. | `/<slug>-<mode>/deploy/machine-key-builder`, handed over read-once to a builder machine. |

The **Pulumi passphrase** encrypts the stack's secret outputs in the state bucket ([Passphrase rotation](#passphrase-rotation)); the boot key is the one there. Nobody types it: it is stored in Secret Manager at `/<slug>-<mode>/engine/pulumi-passphrase`, outside every VM's reach, and the CLI reads it with the operator key your session is unlocked with, and the main job's definition references it. The stack's salt is kept beside it (`pulumi-encryption-salt`), and the main job writes it into the stack file of the commit it deploys, so any commit decrypts the state, a release older than a passphrase rotation too. A stack set up before this copy existed asks for the passphrase once, at the first unlocked action, and stores it.

On an operator machine `infra/.env.<mode>` therefore holds the observer key and nothing a change needs: the CLI reads neither a privileged key nor the passphrase from a file or the environment, as a reference or as a value, and names what it found there. That is deliberate. A value on disk would let a script on the machine change infrastructure with nobody at the terminal ([env-files.ts](../../infra/lib/utils/env-files.ts)). The admin application key is retired: `SCW_ADMIN_*`, and the `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` / `SCW_STATE_*` names it had in the file before, are not read, and the CLI says to remove them; in the process environment `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` keep meaning the key the process was started with (the main job's deploy key). On start the CLI prints which principal the observer key belongs to, whether the stack is locked, what is live, and whether Scaleway takes the operator key from this machine's address.

Every action that changes the Pulumi state, or takes the stack lock, takes the operator key, asked once per run of the CLI and kept in memory until you quit. The observer key reads the state bucket for `status` and changes nothing. Each action still verifies the passphrase against the stack.

### If a key is lost

| Key | Whoever holds it reaches | What you do |
| --- | --- | --- |
| Owner API key | Everything, IAM included, from every address | Revoke it in the console; then **Rotate keys** in each environment |
| Operator key | Every product and secret of the app's projects, from your dedicated address | **Set up operator key** (Owner API key), then **Rotate keys** and **Rotate secrets** in each environment |
| Observer key | Read-only views, from your dedicated address | **Rotate keys** replaces it |
| Deploy key | Its environment's runtime secrets, machines, load balancers and private networks, from any address; not IAM, the database instance, the VPC, DNS, bucket policies or state history | **Rotate keys**, then **Rotate secrets**: each starts the deploy that replaces every machine, and Rotate keys prints the inventory |
| Runner key | Every served environment's deploy key and passphrase, from the runner's address | `pnpm infra runner-identity --rotate-key`, **Replace the runner**, then the deploy key's row in each environment |
| Builder key | Image pushes and frontend files of its environment | **Rotate keys**: a build pushed before it is never trusted after it, and the next deploy builds again |
| A machine's key | Its own service's secrets, on a shared host its neighbours' | **Rotate keys** |

## Operator key

`pnpm infra` → **Rotate keys & secrets** → **Set up operator key** (`pnpm infra operator-key`), run once per app with your Owner API key (a first setup runs it for you), and again when the address changes. A new environment needs no new key, as its setup adds the environment to the operator's policy in place. The action:

1. Asks for the dedicated IPv4 address or addresses the key works from; the default is the address this machine reaches the internet with. Ranges wider than `/24` are refused, as for the database allowlist.
2. Creates the `<app>-operator` application with a policy of up to three rules: every product in the project of each environment this machine knows (the ones whose setup wrote a project to `infra/.env.<mode>`) and of each project it reaches already (the runner's), DNS in the serving zone's project when that is none of them, and IAM read in the organization. Each rule carries the same address condition. The app's name is production's slug, the one in `shared/config/config.default.ts`, so staging (`cella-staging`) and production (`cella`) share `cella-operator`.
3. Shows the new key once and waits until you confirm it is in your password manager.
4. Gives the observer the same addresses; its key keeps working.
5. Tries the key from this machine until Scaleway accepts it. A new policy takes about a minute to apply, and single APIs follow later still.

From another address Scaleway refuses the key: IAM, Secret Manager and Object Storage answer with an error, while the database and Instances APIs answer a list with nothing in it. A stack that looks empty from a new address is therefore the address, not the stack.

Running the action again replaces the policy and every earlier key. It needs your Owner API key each time: the operator key writes no IAM, its own policy included. Keep the Owner account for this and for recovery, with MFA and no API key lying around.

**A new dedicated address** is set the same way, with **Set up operator key**, which gives it to the observer too, or by editing the address in the rules of both policies, the operator's and the observer's, in the console. List the old address beside the new one to keep both. Scaleway applies a policy change within a few minutes, one API after the other, so an address that was removed can still work for a short while.

**How a session is unlocked.** The first action that changes something, or that needs the passphrase, asks for the operator key, access key and secret key. The CLI proves it by asking IAM who bears it, with the key itself: the answer has to be the operator application. It keeps the pair in memory until you quit, and every action of the run works with that key. When Scaleway refuses the key, the CLI says why: a secret key Scaleway does not know, or an address off the list, with this machine's address beside the ones the policy names.

## Repository read key

The builder fetches a release's commit from the repository the root `package.json` names. A repository anyone may read needs nothing; a private one needs a read-only key in each environment, set before its first deploy: `pnpm infra repository-key`, on your operator key. Make a fine-grained GitHub token for that repository only, with **Contents: read** and nothing else, and an expiry. The action checks that the repository answers to it, then stores it in the environment's deploy folder (`/<slug>-<mode>/deploy/repository-read-key`). The deploy hands it to the builder in its read-once bundle, and the builder sends it as a header with its one fetch, so it is in no URL and no file the build sees. Run the action again to replace it before it expires; an empty answer removes it. A build that fails at its fetch names the action. Where the runner is set up, the action keeps a copy in the runner's project, and **Replace the runner** gives it to the runner machine, which reads the repository with it.

## Rotation

Two acts, each recorded in the control object with when and from which machine user, and `pnpm infra` opens with the last of each kind ("never" where that is so). The record is the CLI's own note; `status` lists every key's age as IAM reports it. No date is a deadline: nothing fails by age. A rotation raises a counter that is part of every new generation's identity, and ends by starting the environment's target, so that deploy replaces every machine, also on the same release, and none keeps a key or a value from before. After a compromise, rotate keys first.

**Rotate secrets** (`pnpm infra rotate-secrets`, operator key): a fresh password for every database role, set on the live role through the database API, and a fresh value for every generated secret marked `rotatable` in [runtime-secrets.config.ts](../../infra/config/runtime-secrets.config.ts), every consumer's copy rewritten. A key that encrypts or hashes stored data (`data-encryption-key`, `pii-hash-secret`) is not marked: a new value would leave that data unreadable or unmatched, so it needs a rotation in the app, with both keys at hand. The running machines keep the old values until the deploy the rotation starts replaces them, and the database refuses the new connections they open with the old passwords meanwhile. Third-party keys are pasted anew in **Manage runtime secrets**, the passphrase in **Rotate passphrase**.

## Key rotation

1. Have an Owner API key and your operator key at hand.
2. `pnpm infra` → **Rotate keys & secrets** → **Rotate keys**: mints a fresh `<slug>-<mode>-ci-deploy` key, copies it into the engine folder for the [main job](../DEPLOYMENT.md#the-main-job). It also replaces the observer key (rewritten in every `infra/.env.<mode>` on this machine that holds it; a copy on another machine stops working), the builder key and every standing machine key, deleting the old ones. No key is written to stack config.
3. The rotation is recorded with your operator key and starts the environment's target. The running machines booted with the old machine keys, which are deleted now: until that deploy replaces them, a reboot cannot hydrate and the backend's presigned URLs fail. The rotation then prints the inventory: what exists beside what the environment declares.
4. The runner key is the app's, across its environments: after a suspected compromise, `pnpm infra runner-identity --rotate-key` (Owner API key), then `pnpm infra runner-replace`.
5. Revoke a pasted key in the Scaleway console.

To put the observer key on another machine, run **Update identities** there with your Owner API key: it makes a key of the observer for that machine, and the keys elsewhere keep working.

## Passphrase rotation

`pnpm infra` → **Rotate keys & secrets** → **Rotate passphrase**:

1. Verifies the current passphrase and generates a new one, shown once. Store it first.
2. Re-encrypts the stack (`pulumi stack change-secrets-provider passphrase` rewrites the state object and `Pulumi.<stack>.yaml` with a fresh `encryptionsalt`) under the stack lock, and verifies the rewritten file decrypts with the new passphrase.
3. Stores the new passphrase and the stack's new salt in Secret Manager, where the operator key and the main job read them: a deploy of any commit, a release older than the rotation too, decrypts the state.
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
2. **Rotate keys**, then **Rotate secrets**, in each environment. `data-encryption-key` and `pii-hash-secret` do not rotate here ([Rotation](#rotation)).
3. Remove the person from the Scaleway organization and from the repository.

## Retired admin application

Stacks set up before the observer have a `<slug>-<mode>-admin` application, and their bucket policies were written before the operator was admitted: they name the admin application and shut the operator out. A bucket policy shuts out every principal it does not name, the organization Owner included, so only the admin application can rewrite them. The first apply (or setup resume, Rotate secrets, teardown) on such a stack reads the admin key from its custody secret at `/<slug>-<mode>/engine/admin-key` with the operator key, and adds a statement that admits the operator to each policy that does not name it, keeping the admin's statements; the apply itself then writes the program's policies, which drop them. Afterwards **Update identities** deletes the admin application with its keys and its custody secret. It keeps both while the state bucket does not admit the observer yet, as that is how it knows the policies were rewritten.
