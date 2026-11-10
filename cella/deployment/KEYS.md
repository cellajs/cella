# Keys and rotation

This document explains the [Scaleway IAM](https://www.scaleway.com/en/docs/iam/concepts/) keys a deployment uses, how to rotate them, and what to do when one is lost.

### TL;DR

Every key does one kind of work: an Owner API key for IAM writes, a one-day operator key per sitting, a deploy key and an uploads key per environment. No machine holds a key, and every key a person pastes dies within a day. Rotating keys or secrets deploys the live release again on new machines.

## Zones

Every wall stands between two zones. None stands between two holders of one zone,
since whoever chooses the code that runs with an environment's secrets reads them. A wall is a call Scaleway refuses.

| Zone | Holders | Reaches |
| --- | --- | --- |
| **Owner** | Your Owner API key, for hours | The organization, IAM included |
| **Operator**, one per app | A one-day key of the app's operator application, or of a member of its operators group | Every product of the app's projects and DNS in the DNS zone's project. No IAM write |
| **Deploy path**, one per environment | The code it deploys, the deploy key, any key that reads its machines | The environment's runtime secrets, machines, private networks, release archives, env files, frontend files, the live record and the lease |
| **Outside** | The observer, the builder, the build containers, a service's machine, other environments and apps | No key of the deploy path. A machine reads its own env file, once |

In the deploy path, the deploy key composes each machine's env file from the runtime values. It also signs the links that machines and the builder fetch and write through.

The code it deploys reads the values its machines receive, and never runs beside the deploy key. The main job runs the engine image an apply published. The target's code builds on the builder, which holds no key.

## API keys

Every key is named after its bearer, the way the Scaleway console shows it.

| Key | Does | Works from | Lives in | Replaced by |
| --- | --- | --- | --- | --- |
| **Owner API key**: your own, as organization Owner | Everything. The one key that writes IAM | Any address | Nowhere: typed at the prompt | Made per occasion with an expiry of hours, revoked after |
| **Operator**: `<app>-operator`, or your own user in `<app>-operators` | Every product in the app's projects, the engine image's push included, and IAM read. No IAM write | Any address, within the day | Nowhere: made by a first setup, then in the console at each sitting | Ends by itself. **Set up operators** rewrites the policies |
| **Deploy**: `<slug>-<mode>-ci-deploy` | One environment's machines with their private NICs, and its boot-diag bucket but the final dumps. Reads the load balancer and the runtime folder | Any address | `deploy-key` in the engine folder | **Rotate keys** |
| **Observer**: `<app>-observer` | Read-only on the app's projects, and on the boot accounts, run records and `control/` of the boot-diag bucket. No machine, archive, env file or state | Any address | `SCW_OBSERVER_*` in `infra/.env.<mode>` | Deleted in the console. **Update identities** makes a machine a new one |
| **Uploads**: `<slug>-<mode>-uploads` | Objects of the two upload buckets: the backend's uploads and presigned URLs | Any address | The runtime folder, and the env file of each machine that signs uploads | **Rotate keys** |

**Owner moments.** The CLI asks for an Owner API key only where IAM is written:

- a first setup
- **Set up operators**
- **Rotate keys**
- **Update identities**
- minting a managed key: a scoped key an app service reads, such as an AI key
- **Tear down**

Each one refuses a key without an expiry or with more than a day left. Such a key would write IAM from every address between the moments. Keep the Owner account for recovery, with MFA.

**The observer** has one key per operator machine. That key serves every environment there. **Update identities** on another machine, with your Owner API key, makes that machine its own. The key reads nothing that holds a key, a secret value or the app's code, since it works from any address. **Rotate keys** leaves it alone.

**The engine image.** An apply builds it on your machine and pushes it to the environment's registry namespace with your operator key. Your own Docker config never holds that key. The image holds the engine's code and the description of the app, and no key or secret value.

No key of the engine's pulls the image: Serverless Jobs pulls it for each run from the registry of the job's own project. The deploy key holds no registry right.

**What the deploy key cannot do.** It writes none of these, which take the operator key or an Owner moment:

- IAM, the database instance or its backups
- the VPC, DNS, the load balancer or a pool
- a bucket's configuration or policy
- a secret, an image or the job definition
- the Pulumi state, which it does not reach at all

It reads secret values in the runtime folder only, never the passphrase or the database passwords. It moves traffic only by the machines it makes and drains, as every pool lists the reserved addresses for good.

It does write private networks and IPAM, which a private NIC at a reserved address needs. A leaked key can attach a machine of its own to the environment's network, or reserve addresses in it.

Of the buckets, it reaches:

- **Private uploads bucket:** never
- **Public uploads bucket:** only `geoip/`
- **Boot-diag bucket:** only `releases/`, `env/`, `boot-diag/`, `runs/` and `control/`, never `dumps/`

**Machines and the builder hold no key.** A machine's user data carries its boot plan, its manifest and links the deploy signed. One link fetches its env file, one loads each image archive, and one uploads its boot account.

A link names one object. A machine's link ends within minutes, the builder's within the hour. Once the boot account arrived, the deploy strips the links from the user data and deletes the env file.

The manifest holds no secret: only the role, the release and the drain order the agent reads. The builder writes its archives, the manifest and its reports through signed links too.

Every Pulumi run of the stack needs **the recovery passphrase** (Pulumi's passphrase), the key to the stack's secrets. A first setup shows it once, for your password manager. From then on the CLI reads it from the engine folder with your operator key. Your copy restores the engine folder's when it is lost.

A leaked passphrase opens nothing: only the operator reads the state, and it holds no machine and no secret value.

Nothing on an operator machine changes infrastructure with nobody at the prompt. Its `infra/.env.<mode>` holds the observer key and nothing a change needs. The CLI reads no privileged key and no passphrase from a file or the environment.

### Secret folders

An environment's secret folders sit at the root of its own Scaleway project. Each key's policy names the folders it reads in that project:

- `/runtime/`: one container per value, read by the deploy key
- `/engine/`: the deploy key's copy, the passphrase and the database passwords, read only by the operator

`/runtime/` holds every runtime secret, the uploads key's two halves and the repository read key. A change of consumers writes no IAM, since a deploy composes each machine's env file from the values its services consume ([config/runtime-secrets.config.ts](../../infra/config/runtime-secrets.config.ts)).

On a shared host the services share their secrets: they read one env file.

### If a key is lost

| Key | Whoever holds it reaches | What you do |
| --- | --- | --- |
| Owner API key | Everything, IAM included, from every address | Revoke it in the console. Then **Rotate keys** in each environment |
| Operator key | Every product and secret of the app's projects, until it ends within the day | Revoke it in the console: IAM → Applications → `<app>-operator` → API keys, or your user's keys. When it may have been used, **Rotate keys** and **Rotate secrets** in each environment |
| Observer key | Read-only views, no machine, image or secret value, from any address | Delete that machine's key in the console ([Someone leaves](#someone-leaves)) |
| Deploy key | Its environment's runtime secrets, machines, private networks, archives and env files, from any address | **Rotate keys**, then **Rotate secrets** |
| Uploads key | The objects of its environment's upload buckets | **Rotate keys** |
| A machine's links | While they last, its own env file and the release's archives | They end within minutes. **Rotate secrets** when a link may have been read |

## Operator key

A privileged action runs on a key that ends within a day. It is a key of the `<app>-operator` application, or your own as a member of the `<app>-operators` group. It dies by itself. Nothing is stored, and nothing is revoked after.

`pnpm infra` → **Operators & keys** → **Set up operators** (`pnpm infra operator-key`) runs once per app with your Owner API key. A first setup runs it for you. It makes the `<app>-operator` application and the `<app>-operators` group, and writes one policy for each with the same rules. It makes no key.

A key of either keeps working, since the policies are written in place. A new environment's setup adds its project to both. Staging and production share one set of operators, since the name is production's slug.

Add members in IAM → Groups → `<app>-operators`. Each member then holds what the application holds.

**The first key.** An environment's setup makes it in its Owner moment, once the operators are written. It is a key of `<app>-operator` that ends within the day, kept in memory for the rest of that run. The operator part runs on it, so a setup asks for no operator key unless that key could not be made.

**A sitting.** Later keys are made in the console at the start of a sitting. Go to [IAM → API keys](https://console.scaleway.com/iam/api-keys) → Generate API key, with `<app>-operator` as its bearer and an expiration of a day at most. A member of `<app>-operators` can use their user → API keys, with the same expiration. Paste the key at the first action that changes something.

**How a session is unlocked.** The first action that changes something or needs the passphrase asks for the key at the **Operator key** prompt. One line above it says where the key comes from, with the console link. The access key shows the example `SCWXXXXXXXXXXXXXXXXX` until you type. As you type, it is checked for that form: `SCW` and 17 capitals or digits. The secret key, masked, must be a UUID. With the key itself, the CLI asks IAM who bears it.

It accepts the operator application or a user the operators group lists. It refuses a key of anyone else, and a key without an end date or with more than a day left. A key that leaks must die within the day. For a key the setup just made, the CLI asks IAM again a few times, as a new key's policy holds only after a moment.

The key stays in memory until you quit. Every action of the run uses it.

**Buckets.** A bucket policy refuses every principal it does not name, your Owner API key included. Each policy names the operator application and every member of the group, as the apply finds them in IAM. A member reaches the buckets only after the first apply since they joined. That apply runs on the application's key or an admitted member's.

The inventory in **Full status** names a key of the operator application that outlives a day. Delete it in the console.

## Repository read key

The builder fetches the target commit from the repository the root `package.json` names. The main job reads the environments file and lists the release tags there, with the same key. A public repository needs nothing. A private one needs a read-only key in each environment before its first deploy:

1. Make a fine-grained GitHub token with an expiry for that repository only. Give it **Contents: read** and nothing else.
2. Run `pnpm infra repository-key` on your operator key. It checks that the repository answers to the token. Then it stores the token in the environment's runtime folder, where the next scheduled run reads it.

The token goes as a header with each fetch, in no URL and no file the build sees. Run the action again to replace it before it expires. An empty answer removes it.

## Rotation

**Full status** lists every key's age. No age is a deadline. After a compromise, rotate keys first.

No machine keeps a key or a value from before a rotation: it ends by deploying the live release again on new machines. Then it starts the environment's target when that is another commit with no run yet, so a rollback holds. A target that fails never leaves the machines on what the rotation replaced, since the live release deployed once already.

### Rotate secrets

**Rotate secrets** (`pnpm infra rotate-secrets`, operator key) sets a fresh password on every database role. It also sets a fresh value for every generated secret marked `rotatable` in [runtime-secrets.config.ts](../../infra/config/runtime-secrets.config.ts). The running machines keep the old values in their env files until the deploy replaces them. Meanwhile the database refuses the new connections they open.

`data-encryption-key` and `pii-hash-secret` encrypt or hash stored data. Neither rotates here or in the app, which holds one value of each.

A new encryption key leaves every stored TOTP secret and OAuth signing key unreadable. A new hashing secret leaves every stored IP, device and rate-limit hash unmatched. Each browser then signs in as a new device.

After a leak of either, the recovery is a new value and re-enrolment. Users set up their authenticator again, and the signing keys are replaced. Data copied before the change stays readable to whoever holds the old value.

Third-party keys are pasted anew in **Env vars & secrets**.

### Rotate keys

`pnpm infra` → **Operators & keys** → **Rotate keys** replaces the deploy key and the uploads key, and deletes the old ones. It needs an Owner API key and your operator key.

After a compromise, one **Rotate keys** per environment covers every Scaleway key but two. The observer's reads no key, and the operators' end within the day. The inventory names a key an intruder added. Delete it in the console.

The running backend machines hold the deleted uploads key in their env file. Their uploads and presigned URLs fail until the deploy of the live release replaces them. The rotation ends by printing the inventory. Afterwards, revoke the Owner API key you pasted.

## A stolen laptop

The laptop holds the observer key in `infra/.env.<mode>` and nothing else. A one-day operator key pasted that day dies by itself, and the passphrase sits in Secret Manager.

1. Delete the laptop's observer key in the console ([Someone leaves](#someone-leaves)).
2. When an operator key was made that day, revoke it in the console: IAM → Applications → `<app>-operator` → API keys, or your user's keys.
3. When the laptop held your password manager, run **Rotate keys**, then **Rotate secrets**, in each environment.

## Someone leaves

A person who only read holds the observer key of their own machine. Delete that key in the console at IAM → Applications → `<app>-observer` → API keys. Each key's description names its machine and the day it was made. The other machines keep theirs.

A person who ran privileged actions did so on one-day keys, each gone within its day. Meanwhile they could read every secret of the app's projects. When they leave:

1. Remove them from `<app>-operators` in IAM → Groups and from the Scaleway organization. Removal from the organization ends their user's keys. Revoke a key of `<app>-operator` made that day, in IAM → Applications → `<app>-operator` → API keys.
2. **Rotate keys**, then **Rotate secrets**, in each environment. `data-encryption-key` and `pii-hash-secret` do not rotate here ([Rotate secrets](#rotate-secrets)).
3. Delete their machine's observer key, as above.
4. Remove the person from the repository.
