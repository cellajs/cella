# Keys and rotation

This document explains the Scaleway API keys a deployment uses, how to rotate them, and what to do when one is lost.

### TL;DR

Every key does one kind of work: an Owner API key only for the moments that write IAM, a one-day operator key per
sitting, a deploy key and an uploads key per environment. No machine a deploy makes holds a key: it fetches its images and its env
file through links that end within minutes. Every key a person pastes dies within a day, and no privileged key or
passphrase sits in a file on your machine. Rotating keys or secrets deploys the live release again, which replaces
every machine.

## Zones

Whoever chooses the code that runs with an environment's secrets reads them. So every wall stands between two zones, where Scaleway
refuses the call, and none between two holders of one zone.

| Zone | Holders | Reaches |
| --- | --- | --- |
| **Owner** | Your Owner API key, for hours | The organization, IAM included |
| **Operator**, one per app | A one-day key of the app's operator application, or a member of its operators group with a one-day key of their own | Every product of the app's projects, DNS in the DNS zone's project; no IAM write |
| **Deploy path**, one per environment | The code it deploys, the deploy key, any key that reads its machines | The environment's runtime secrets, machines, private networks, release archives, env files, frontend files, the live record and the lease |
| **Outside** | The observer, the builder, the build containers, a service's machine, other environments and apps | No key of the deploy path; a machine its own env file, once |

In the deploy path the deploy key composes each machine's env file from the runtime values and signs the links a machine and the builder
fetch and write through. The code it deploys reads the values its machines receive, and never runs beside the deploy key: the main job
runs the engine image an apply published, and the target's code builds on the builder, which holds no key.

## API keys

Every key is named after its bearer, the way the Scaleway console shows it.

| Key | Does | Works from | Lives in | Replaced by |
| --- | --- | --- | --- | --- |
| **Owner API key** (your own, as organization Owner) | Everything; the one key that writes IAM | Any address | Nowhere: typed at the prompt | Made per occasion with an expiry of hours, revoked after |
| **Operator** (`<app>-operator`, or your own user in `<app>-operators`) | Every product in the app's projects, the engine image's push to the registry included, IAM read; no IAM write | Any address, within the day | Nowhere: made by a first setup, then in the console at each sitting | Ends by itself; **Set up operators** rewrites the policies |
| **Deploy** (`<slug>-<mode>-ci-deploy`) | One environment's machines and their private NICs at the reserved addresses, which takes IPAM's write set, its boot-diag bucket but the final dumps; reads the load balancer and the runtime folder | Any address | `deploy-key` in the engine folder | **Rotate keys** |
| **Observer** (`<app>-observer`) | Read-only on the app's projects, the boot accounts, run records and `control/` of the boot-diag bucket; no machine, archive, env file or state | Any address | `infra/.env.<mode>` (`SCW_OBSERVER_*`) | Deleted in the console; **Update identities** makes a machine a new one |
| **Uploads** (`<slug>-<mode>-uploads`) | Objects of the two upload buckets: the backend's uploads and presigned URLs | Any address | The runtime folder, and the env file of each machine that signs uploads | **Rotate keys** |

**Owner moments.** The CLI asks for an Owner API key only where IAM is written: a first setup, **Set up operators**, **Rotate keys**, **Update identities**, minting a managed key (a scoped key an app service reads, such as an AI key) and **Tear down**, whose one key deletes the resources with the identities. Each one refuses a key without an expiry or with more than a day left, as such a key writes IAM from every address between the moments. Keep the Owner account for recovery, with MFA.

**The observer** has one key per operator machine, which serves every environment there; the key's description names the machine and the day it was made. **Update identities** on another machine, with your Owner API key, makes that machine its own. The key works from any address, so it reads nothing that holds a key, a secret value or the app's code: no machine, no archive, no env file, no stack checkpoint. **Rotate keys** leaves it alone.

**The engine image.** An apply builds it on your machine and pushes it to the environment's registry namespace with your operator key, through a Docker config of its own that the apply deletes after the push, so your own Docker config never holds the key. Serverless Jobs pulls the image for each run from the registry of the job's own project: no key of the engine's pulls it, and the deploy key holds no registry right. The image holds the engine's code and the description of the app, no key and no secret value.

**What it cannot do.** The deploy key writes no IAM, database instance or backups, VPC, DNS, load balancer, pool, bucket configuration or policy, secret, image or job definition, and reaches no Pulumi state: those take the operator key or an Owner moment. It reads secret values in the runtime folder only, never the passphrase or the database passwords. It moves traffic only by the machines it makes and drains, as every pool lists the reserved addresses for good. It writes private networks and IPAM, as a private NIC at a reserved address takes the network's write set and the address's, so a leaked key can attach a machine of its own to the environment's network or reserve addresses in it. Of the buckets, it never reaches the private uploads bucket, of the public one only `geoip/`, and of the boot-diag bucket only the prefixes a deploy reads and writes: `releases/`, `env/`, `boot-diag/`, `runs/` and `control/`, never a final dump under `dumps/`.

**Machines and the builder hold no key.** A machine's user data carries its boot plan, its manifest and links the deploy signed: one to fetch its env file, one per image archive it loads, one to upload its boot account. A link names one object and ends within the hour; once the boot account arrived, the deploy rewrites the user data without them and deletes the env file. The manifest holds no secret: the role, the release and the drain order the agent reads. The builder writes each archive, the frontend's archive, the manifest and its reports through links the same way.

**The Pulumi passphrase** is the key of the stack's secrets provider, which every Pulumi run of the stack asks for. A first setup shows it once, for your password manager; from then on the CLI reads it from the engine folder with your operator key. Your copy restores the engine folder's when it is lost. Only the operator reads the state, which holds no machine and no secret value, so a leaked passphrase opens nothing.

On an operator machine `infra/.env.<mode>` holds the observer key and nothing a change needs: the CLI reads no privileged key and no passphrase from a file or the environment, so nothing on the machine changes infrastructure with nobody at the prompt.

### Secret folders

Each environment has a Scaleway project of its own, so its Secret Manager starts at the project's root. It is split into folders, and each key's policy names the folders it reads in that project:

- `/runtime/`: one container per value, read by the deploy key: every runtime secret, the uploads key's two halves and the repository read key. A deploy composes each machine's env file from the values its services consume ([config/runtime-secrets.config.ts](../../infra/config/runtime-secrets.config.ts)); a change of consumers writes no IAM.
- `/engine/`: the deploy key's copy, the passphrase and the database passwords, which only the operator reads.

On a shared host the services read one env file, so they share their secrets.

### If a key is lost

| Key | Whoever holds it reaches | What you do |
| --- | --- | --- |
| Owner API key | Everything, IAM included, from every address | Revoke it in the console; then **Rotate keys** in each environment |
| Operator key | Every product and secret of the app's projects, until it ends within the day | Revoke it in the console (IAM → Applications → `<app>-operator` → API keys, or your user's keys); when it may have been used, **Rotate keys** and **Rotate secrets** in each environment |
| Observer key | Read-only views, no machine, image or secret value, from any address | Delete that machine's key in the console ([Someone leaves](#someone-leaves)) |
| Deploy key | Its environment's runtime secrets, machines, private networks, archives and env files, from any address | **Rotate keys**, then **Rotate secrets** |
| Uploads key | The objects of its environment's upload buckets | **Rotate keys** |
| A machine's links | While they last, its own env file and the release's archives | They end within minutes; **Rotate secrets** when a link may have been read |

## Operator key

A privileged action runs on a key that ends within a day: one of the `<app>-operator` application, or your own as a member of the `<app>-operators` group. It dies by itself: nothing is stored, and nothing is revoked after.

`pnpm infra` → **Operators & keys** → **Set up operators** (`pnpm infra operator-key`) runs once per app with your Owner API key (a first setup runs it for you). It makes the `<app>-operator` application and the `<app>-operators` group, and writes a policy for each with the same rules: every product of the app's projects, DNS in the serving zone's project, IAM read; no condition. The policies are written in place, so a key of either keeps working, and a new environment's setup adds its project to both. It makes no key. The name is production's slug, so staging and production share one set of operators.

**The first key.** An environment's setup makes it in its Owner moment, once the operators are written: a key of `<app>-operator` that ends within the day, kept in memory for the rest of that run, of which the CLI prints only the access key. The operator part runs on it, so a setup asks for no operator key unless that key could not be made.

**A sitting.** Later, you make the key in the console at the start of a sitting: IAM → Applications → `<app>-operator` → API keys → Generate API key, with an expiration of a day at most; or, as a member of `<app>-operators`, your user → API keys with the same expiration. Paste it at the first action that changes something. Members are added in IAM → Groups → `<app>-operators`; each then holds what the application holds.

**How a session is unlocked.** The first action that changes something, or that needs the passphrase, asks for the key at the **Operator key** prompt. One line above it says where the key comes from, with the console link. The access key shows the example `SCW10X9PSSZ7B106DZNY` until you type, and is checked for that form as you type: `SCW` and 17 capitals or digits. The secret key, masked, must be a UUID. The CLI asks IAM who bears the key, with the key itself: the operator application, or a user the operators group lists. A key of anyone else, and a key without an end date or with more than a day left, is refused with the console path above: a key that leaks must die within the day. For a key the setup just made, the CLI asks IAM again a few times, as a new key's policy holds only after a moment. The key stays in memory until you quit, and every action of the run uses it.

**Buckets.** A bucket policy refuses every principal it does not name, your Owner API key included. Each one names the operator application and every member of the group in one statement, as the apply finds them in IAM, so the members never run into the ten statements a bucket policy holds. A member reaches the buckets after the first apply since they joined, which runs on the application's key or an admitted member's.

The inventory in **Full status** names a key of the operator application that outlives a day: delete it in the console.

## Repository read key

The builder fetches the target commit from the repository the root `package.json` names, and the main job reads the environments file and lists the release tags there with the same key. A public repository needs nothing. A private one needs a read-only key in each environment before its first deploy:

1. Make a fine-grained GitHub token for that repository only, with **Contents: read** and nothing else, and an expiry.
2. Run `pnpm infra repository-key` on your operator key. It checks that the repository answers to the token, then stores it in the environment's runtime folder, where the next scheduled run reads it.

The token goes as a header with each fetch, in no URL and no file the build sees. Run the action again to replace it before it expires; an empty answer removes it.

## Rotation

**Full status** lists every key's age; no age is a deadline. A rotation ends by deploying the release that is live again, which replaces every machine, so none keeps a key or a value from before, and then by starting the environment's target when it is another commit with no run yet, so a rollback stays in place. The live release deployed once already, so a target that fails never leaves the machines on what the rotation replaced; a rotation before the first deploy starts the target alone. After a compromise, rotate keys first.

### Rotate secrets

**Rotate secrets** (`pnpm infra rotate-secrets`, operator key) sets a fresh password on every database role and a fresh value for every generated secret marked `rotatable` in [runtime-secrets.config.ts](../../infra/config/runtime-secrets.config.ts), in the runtime folder. The running machines keep the old values in their env files until the deploy replaces them, and the database refuses the new connections they open meanwhile.

A key that encrypts or hashes stored data (`data-encryption-key`, `pii-hash-secret`) rotates neither here nor in the app, which holds one value of each. A new encryption key leaves every stored TOTP secret and OAuth signing key unreadable; a new hashing secret leaves every stored IP, device and rate-limit hash unmatched, so each browser signs in as a new device. After a leak of either, the recovery is a new value and re-enrolment: users set up their authenticator again and the signing keys are replaced. Data copied before the change stays readable to whoever holds the old value. Third-party keys are pasted anew in **Env vars & secrets**.

### Rotate keys

With an Owner API key and your operator key at hand, `pnpm infra` → **Operators & keys** → **Rotate keys** replaces the deploy key and the uploads key, and deletes the old ones.

After a compromise, one **Rotate keys** per environment covers every Scaleway key but the observer's, which reads no key, and the operators', which end within the day; the inventory names a key an intruder added, which you delete in the console.

The running backend machines hold the deleted uploads key in their env file: until the deploy of the live release replaces them, their uploads and presigned URLs fail. The rotation ends by printing the inventory. Revoke the Owner API key you pasted afterwards.

## A stolen laptop

The laptop holds the observer key in `infra/.env.<mode>` and nothing else: a one-day operator key pasted that day dies by itself, and the passphrase sits in Secret Manager.

1. Delete the laptop's observer key in the console ([Someone leaves](#someone-leaves)).
2. When an operator key was made that day: revoke it in the console (IAM → Applications → `<app>-operator` → API keys, or your user's keys).
3. When the laptop held your password manager: **Rotate keys**, then **Rotate secrets**, in each environment.

## Someone leaves

A person who only read holds the observer key of their own machine. Delete that key in the console: IAM → Applications → `<app>-observer` → API keys, where each key's description names its machine and the day it was made. The other machines keep theirs.

A person who ran privileged actions did so on one-day keys, each gone within its day, and could read every secret of the app's projects meanwhile. When they leave:

1. Remove them from `<app>-operators` (IAM → Groups) and from the Scaleway organization, which ends their user's keys, and revoke a key of `<app>-operator` made that day (IAM → Applications → `<app>-operator` → API keys).
2. **Rotate keys**, then **Rotate secrets**, in each environment. `data-encryption-key` and `pii-hash-secret` do not rotate here ([Rotate secrets](#rotate-secrets)).
3. Delete their machine's observer key, as above.
4. Remove the person from the repository.
