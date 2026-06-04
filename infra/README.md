# Infrastructure — deploy guide

Deploy your app to [Scaleway](https://www.scaleway.com/) using Pulumi + GitHub Actions.

> For architecture details and module reference see [INFRA_ARCHITECTURE.md](./INFRA_ARCHITECTURE.md).

## Operating model — two modes

Long-lived infra credentials should not be stored. They live in your password manager and in GitHub Actions secrets, and are only ever read into a process's memory for the duration of a single command.

| Mode | When | How |
|---|---|---|
| **A — Bootstrap** | Once for setup, and again whenever you rotate the CI deploy key. | Run `pnpm --filter infra bootstrap` (or `setup-ci-key` for rotation), paste credentials when prompted. Nothing is written to disk. |
| **B — Routine (CI)** | **Every normal change.** Push to `main`, merge a PR, or click *Run workflow*. | GitHub Actions runs `pulumi up` using the secrets configured in the repo settings. **This is the default path.** |

If you find yourself running Mode A more than once outside of a planned rotation, something is wrong with the workflow and not with you — open an issue.

### Bootstrap modes

When re-run, `pnpm --filter infra bootstrap` detects existing state from
`Pulumi.<stack>.yaml` and offers four modes:

| Mode | Effect |
|---|---|
| **Resume** | Reuses the stored CI key. Re-runs idempotent steps (state bucket, secrets check, edge plan, DNS check, GitHub variable sync). Does **not** touch the IAM policy. **Cannot apply changes to DB / VPC / private network** (CI key is read-only on those). |
| **Rotate CI** | Deletes the existing `<slug>-ci-deploy` API key and IAM policy, mints a fresh key, re-attaches the policy with current `PROJECT_PERMISSION_SETS`, pushes new secrets to GitHub. Use after rotating credentials **or after changing permission sets in `tasks/setup-ci-key.ts`**. |
| **Apply infra change** | One-shot `pulumi up` for bootstrap-owned changes (DB, VPC, private network). Prompts for a fresh bootstrap key, swaps it into stack config, runs `pulumi up`, then restores the CI key (`try/finally`). See [Applying a bootstrap-owned change](#applying-a-bootstrap-owned-change). |
| **Clean** | Wipes local state and starts over — see [Clean slate](#clean-slate). |

> To tear down and rebuild the entire stack (with an optional DB snapshot and
> upload backup), see [Destroy & rebuild](./DESTROY_REBUILD.md).

> Resume prints a `⚠ CI policy permission sets have changed` warning when the
> permission-set fingerprint in `Pulumi.<stack>.yaml` doesn't match the current
> `PROJECT_PERMISSION_SETS` / `ORG_PERMISSION_SETS` constants. That means you
> added or removed a permission set in `tasks/setup-ci-key.ts` — re-run and
> pick **Rotate CI** to apply.

## Mode A — Bootstrap (one-time)

### 1. Install tools

```bash
brew install pulumi/tap/pulumi
```

### 2. Create a Scaleway project

Create a project (e.g. `cella-apps`) in the [Scaleway console](https://console.scaleway.com/). Note the **Project ID** and **Organization ID**.

### 3. Generate a bootstrap API key

This key is used *only* during bootstrap and is revoked immediately after. It needs to create IAM applications and policies (i.e. `IAMManager` plus enough to read your project).

**Easiest path — Personal API Key.** If you're an Owner on the organization, just generate a [Personal API Key](https://console.scaleway.com/iam/users) (User menu → API keys → Generate). It inherits your Owner permissions, which is everything bootstrap needs. Delete it the moment bootstrap finishes.

**Stricter alternative — dedicated bootstrap application.** If you'd rather not use a personal key, create an Application in [IAM → Applications](https://console.scaleway.com/iam/applications) (e.g. `bootstrap`) with a policy granting **ProjectManager + IAMManager** on the organization, and generate an API key for it. More setup, same outcome.

Save the access key, secret key, project ID, and organization ID in your password manager for the duration of the bootstrap session only.

### 4. Pick a Pulumi passphrase

Generate a strong passphrase (e.g. `openssl rand -base64 24`). Save it in your password manager *now* — Pulumi cannot recover it, and losing it means rebuilding the stack from scratch.

### 5. Run bootstrap

```bash
pnpm --filter infra bootstrap
```

The script prompts for everything from steps 3 and 4, then runs the full chain in one process:

1. Creates the Pulumi state bucket in Scaleway Object Storage (idempotent).
2. `pulumi login` against that bucket.
3. `pulumi stack init` (or selects the existing stack).
4. Sets `scaleway:projectId`.
5. Prompts for optional values (`adminEmail`, `brevoApiKey`, `scwAiApiKey`) only if not already in the stack file.
6. Initializes stack secrets idempotently — random-generates `dbPassword`, `cookieSecret`, `unsubscribeSecret`, `cdcSecret`, `yjsSecret`; populates env-sourced ones from the prompts. Existing values are never overwritten (see [Rotating a single stack secret](#rotating-a-single-stack-secret)).
7. Subscribes the project to the Edge Services `starter` plan if not already subscribed.
8. Registers `<domain>` as an external DNS zone on Scaleway if missing, then waits for it to become active. Scaleway emails you a TXT `_scaleway-challenge` record and the `ns0/ns1.dom.scw.cloud` NS delegation to publish at your current DNS provider — bootstrap polls until the zone flips to `active`.
9. Creates a `<slug>-ci-deploy` IAM application with a least-privilege policy and a fresh API key, then stores the CI key encrypted in Pulumi stack config. If the `gh` CLI is authenticated it also creates the matching GitHub Environment (e.g. `production`) and writes the CI key and project/organization IDs as **environment-scoped** secrets — so they're only injected into deploy jobs, not every workflow run.
10. Offers to run `pulumi up` immediately to provision base infrastructure (registry, DB, network). Compute VMs are intentionally skipped at this stage — they are deployed by CI after images have been pushed.

### 6. Add GitHub Actions secrets

If `gh` CLI was authenticated during bootstrap, all four Scaleway secrets are already set on the `production` environment. Otherwise add them manually under **Settings → Environments → `production` → Environment secrets** (preferred — environment-scoped) rather than repo-level secrets:

| Secret | Value | Scope | Set by bootstrap? |
|---|---|---|---|
| `SCW_ACCESS_KEY` | CI deploy key access key | environment | ✓ if `gh` auth |
| `SCW_SECRET_KEY` | CI deploy key secret key | environment | ✓ if `gh` auth |
| `PULUMI_CONFIG_PASSPHRASE` | The passphrase from step 4 | environment | manual |
| `SCW_PROJECT_ID` | Scaleway project ID | environment | ✓ if `gh` auth |
| `SCW_ORGANIZATION_ID` | Scaleway organization ID | environment | ✓ if `gh` auth |

> **Naming note.** The bootstrap CLI prompts for `Scaleway bootstrap access key / secret key` — these are the **broad-permission bootstrap credentials** (with `IAMManager`) used to *mint* the CI deploy key. To skip the prompts, export `SCW_BOOTSTRAP_ACCESS_KEY` / `SCW_BOOTSTRAP_SECRET_KEY` (not `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` — those names refer to the *output* CI key that gets stored in GitHub).

### 7. Run initial infrastructure deploy

Bootstrap will offer to run this automatically (using the bootstrap key still in memory — the CI key has read-only access to VPC / private network / RDB and cannot create them on a fresh stack). If you skipped it, run it manually now with the bootstrap key:

```bash
cd infra && \
  SCW_ACCESS_KEY=<bootstrap-access-key> \
  SCW_SECRET_KEY=<bootstrap-secret-key> \
  AWS_ACCESS_KEY_ID=<bootstrap-access-key> \
  AWS_SECRET_ACCESS_KEY=<bootstrap-secret-key> \
  PULUMI_CONFIG_PASSPHRASE=<passphrase> \
  pulumi up --stack organization/infra/production
```

(`SCW_*` authenticates the Scaleway provider; `AWS_*` authenticates the S3-compatible Pulumi state backend — same key, two protocols.)

After it succeeds, persist the CI key into stack config so subsequent CI runs can deploy:

```bash
pulumi config set --secret scaleway:accessKey <ci-access> --stack organization/infra/production
pulumi config set --secret scaleway:secretKey <ci-secret> --stack organization/infra/production
```

(If you declined the auto-deploy, bootstrap printed both values to the terminal — copy them from there. They are not stored anywhere readable after the run ends, only written into GitHub Environment secrets which are write-only.)

This creates the registry, database, network, load balancer, and other base resources. **Compute VMs are not deployed here** — bootstrap.ts sets the transient `bootstrap:applyInProgress` marker around the initial `pulumi up`, which gates VMs off (registry has no images yet, so they would crash-loop). The marker is cleared automatically when the run succeeds.

After this completes, commit the updated `infra/Pulumi.production.yaml` and push to `main`. CI will then build and push Docker images and run a second `pulumi up`. The marker is no longer set, so compute VMs come up on their own. **You do not need to run `pulumi up` a second time locally.**

### 8. Revoke the bootstrap key

> **Do this immediately after bootstrap completes.**

The bootstrap key has broad permissions and is no longer needed. In the Scaleway console:

1. Go to [IAM → API Keys](https://console.scaleway.com/iam/api-keys) and delete the bootstrap key.
2. Optionally delete the bootstrap IAM application entirely.

The `<slug>-ci-deploy` application created by bootstrap is the only key that should remain.

From here on, **all routine deploys happen in CI** (Mode B).

### Permission sets granted to the CI deploy key

Defined in [`tasks/setup-ci-key.ts`](tasks/setup-ci-key.ts) — `PROJECT_PERMISSION_SETS`
(project scope) and `ORG_PERMISSION_SETS` (organization scope). The list is
deliberately split into **write at steady state** vs **read-only**:

| Resource family | CI key | Owned by |
|---|---|---|
| Container Registry, Instances, Load Balancers, Edge Services, Object Storage, Secret Manager, Observability | `…FullAccess` | CI deploys mutate these on every run. |
| **VPC, Private Network, RDB** | `…ReadOnly` | **Bootstrap key.** Created once at bootstrap, refreshed but never mutated by CI. |
| DNS (`DomainsDNSFullAccess`, org scope) | Full | CI may add/update A records when modules change. |

This means **any change to [`modules/database.ts`](modules/database.ts), [`modules/network.ts`](modules/network.ts), or anything else under VPC / PN / RDB will fail in CI** with `insufficient permissions: write …`. That's intentional — destructive operations on data-bearing resources go through a human running `pulumi up` locally with the bootstrap key.

#### Applying a bootstrap-owned change

Re-run bootstrap and choose **Apply infra change**. The mode:

1. Prompts for the Pulumi passphrase and decrypts the current CI key from stack config (held in memory only).
2. Prompts for a fresh bootstrap key (broad permissions, see [Step 3](#3-generate-a-bootstrap-api-key)).
3. Writes the bootstrap key into stack config.
4. Runs `pulumi up`.
5. **Always** restores the CI key into stack config — even if `pulumi up` failed or was cancelled (`try/finally`). If restore itself fails, the exact commands to repeat manually are printed to stderr.
6. Reminds you to revoke the bootstrap key.

You can also supply `SCW_BOOTSTRAP_ACCESS_KEY` / `SCW_BOOTSTRAP_SECRET_KEY` / `PULUMI_CONFIG_PASSPHRASE` as env vars to skip the prompts.

> The Scaleway provider reads credentials from stack config in preference to env vars, so a naive `SCW_ACCESS_KEY=… pulumi up` does **not** override the CI key once it's persisted in `Pulumi.<stack>.yaml`. Apply-mode performs the swap-and-restore on stack config, which is the only mechanism the provider honours.

#### When CI fails with `insufficient permissions: write <resource>`

`pulumi up` (whether in CI or from `bootstrap`) inspects this error class and prints a hint:

- If `<resource>` is bootstrap-owned (matches `private_network`, `vpc*`, `rdb*`, `instance_db`, `domain_zone`) → re-run bootstrap, choose **Apply infra change**.
- Otherwise → add the matching permission set to `PROJECT_PERMISSION_SETS` in [`tasks/setup-ci-key.ts`](tasks/setup-ci-key.ts), then re-run bootstrap → **Rotate CI**.

Note that some Scaleway resources are still backed by *legacy* IAM namespaces.
For example, `scaleway:network:PrivateNetwork` requires `PrivateNetworksFullAccess` / `PrivateNetworksReadOnly` (not the modern `VPC*` sets) because the provider still calls the legacy `compute_private_networks` endpoint.

<a id="clean-slate"></a>
### Clean slate (start over from scratch)

1. `rm infra/Pulumi.<stack>.yaml`
2. (optional) Scaleway console → Object Storage → delete bucket `<slug>-pulumi-state`. Note: Scaleway reserves bucket names for several hours after deletion.
3. (optional) Revoke the bootstrap API key in the Scaleway console.
4. (optional) Delete IAM application `<slug>-ci-deploy` and its policy.
5. (optional) Remove `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` from the `production` GitHub Environment (Settings → Environments → production → Environment secrets).
6. Re-run: `pnpm --filter infra bootstrap`

## Mode B — Routine deploys (CI)

The workflow at [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) runs:

- **On push to `main`** — builds images, uploads the frontend, runs `pulumi up`, verifies the deployment.
- **On manual dispatch** — same, against the chosen environment (`staging` or `production`).

A separate workflow at [.github/workflows/infra-preview.yml](../.github/workflows/infra-preview.yml) runs `pulumi preview` on every PR that touches `infra/` or `shared/`, so you can review the plan before merging.

Routine deploys don't replace VMs. CI writes the new image SHA to the deploy-tags bucket; the on-VM reconciler pulls it and rolls the app behind a per-VM ingress proxy — in-place for cdc/yjs/ai/frontend, blue-green (two slots) for the backend — so the load balancer backend never drains. See [INFRA_ARCHITECTURE.md → Zero-downtime deploys](./INFRA_ARCHITECTURE.md#zero-downtime-deploys) for the rollover model and [Operating the reconciler](./INFRA_ARCHITECTURE.md#operating-the-reconciler) for diagnostics and rollback.

To trigger a staging deploy: GitHub → Actions → Deploy → Run workflow → select `staging`.

To gate production behind manual approval, configure a [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) named `production` with required reviewers — the workflow already targets it.

After the first deploy:

```bash
pulumi stack output apiDomainUrl
pulumi stack output frontendBucketEndpoint

# Run database migrations and initial seed. Requires PULUMI_CONFIG_PASSPHRASE
# and Scaleway state-bucket credentials in your environment.
DATABASE_URL=$(cd infra && pulumi stack output dbConnectionStringDirect --show-secrets) \
DATABASE_ADMIN_URL=$DATABASE_URL \
  pnpm --filter backend seed -- init
```

DNS records for api/yjs/ai are created automatically by the `loadbalancer` module if your domain is managed in Scaleway Domains. Otherwise point A records at the LB IP returned by `pulumi stack output`.

## Key rotation

The `<slug>-ci-deploy` API key (used by `pulumi up` to provision Scaleway resources) lives encrypted in the Pulumi stack config. You **should** rotate it periodically — every 90 days is a reasonable cadence, and immediately if there's any reason to believe it leaked.

Rotation is intentionally **manual**. An automated rotator would require a permanent `IAMManager`-capable key sitting in GitHub Actions secrets — a strictly larger blast radius than the key it rotates, since `IAMManager` can manufacture arbitrary new credentials. Manual rotation with a short-lived bootstrap key is the same security model as the initial bootstrap.

### Procedure

1. Generate a temporary bootstrap key (see [Step 3](#3-generate-a-bootstrap-api-key) — Personal API Key is fastest).

2. Run bootstrap and pick **Rotate CI**:

   ```bash
   pnpm --filter infra bootstrap
   ```

   This deletes the existing `<slug>-ci-deploy` API key, mints a fresh one, writes it encrypted into `Pulumi.<stack>.yaml`, and (if `gh` is authenticated) pushes it to the `production` GitHub Environment as `SCW_ACCESS_KEY` / `SCW_SECRET_KEY`.

3. Commit the updated `infra/Pulumi.<stack>.yaml` and push. The next CI deploy will use the new key.

4. **Revoke the bootstrap key.** Same day.

### Rotating a single stack secret

`init-stack-secrets` never overwrites an existing value. To rotate one:

```bash
pulumi config rm infra:cookieSecret --stack organization/infra/<stack>
pnpm --filter infra init-stack-secrets organization/infra/<stack>
```

Or set it directly:

```bash
pulumi config set --secret infra:cookieSecret "$(openssl rand -base64 32)" \
  --stack organization/infra/<stack>
```

### Local credential hygiene

Bootstrap and apply-mode keep Scaleway credentials **in memory only** — they are
never written to disk, and they neutralise any local `~/.config/scw/config.yaml`
profile by pointing `SCW_CONFIG_PATH` at a non-existent file (see
[`src/bootstrap-helpers.ts`](src/bootstrap-helpers.ts)). Keep it that way:

- **Do not run `scw init`.** It writes your access + secret key in plaintext to
  `~/.config/scw/config.yaml`. When you need the `scw` CLI ad-hoc, scope the
  credentials to a subshell with a neutralised config instead:

  ```bash
  ( export SCW_CONFIG_PATH=/dev/null \
      SCW_ACCESS_KEY=… SCW_SECRET_KEY=… SCW_DEFAULT_PROJECT_ID=… ; \
    scw … )
  ```

- **Keep secrets out of shell history.** Setting `SCW_SECRET_KEY=…` or a
  passphrase inline on the command line records the value in `~/.bash_history` /
  `~/.zsh_history`. Either:
  - add `export HISTCONTROL=ignorespace` to your shell rc and prefix any
    secret-bearing command with a leading space, or
  - pipe secrets so they never appear as arguments, e.g.
    `pulumi config get scaleway:secretKey --stack <stack> | gh secret set SCW_SECRET_KEY --env production`.

- **Don't stash Scaleway keys in `~/.aws/credentials`.** The S3 state backend
  needs `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, but prefer exporting them
  per-session over persisting a `[default]` profile — a stale profile silently
  shadows whatever you intend to use and lingers long after the key is revoked.

If a key does leak to disk: revoke it in the Scaleway console first, then scrub
the file(s). Remember that **open shells re-flush their in-memory history on
exit** — after editing `~/.bash_history`, run `history -c` in every open
terminal (or close them) so the scrub isn't overwritten.

## Emergency access to a VM

There is **no inbound SSH** on the compute security group (closed by default). For break-glass:

1. In the [Scaleway console](https://console.scaleway.com/instance/servers), open the misbehaving instance and click **Console** to attach the serial console.
2. Authenticate with the root password set by Scaleway (visible on the instance page).
3. Investigate; capture what you need.
4. Detach and document what was done.

For routine debugging, ship logs / metrics out of the VM (via Cockpit) rather than opening shells.

## Known platform limitations

- **No instance-attached IAM identity (Scaleway).** Application secrets and the registry-login credential are necessarily embedded in cloud-init userdata. Anyone with `InstancesReadOnly` on the project can read them. See [modules/compute.ts](modules/compute.ts) for details. Mitigated by serial-console-only access (no SSH).

- **No response-header injection on Edge Services + S3.** The frontend SPA is served from the S3 bucket via Scaleway Edge Services. Neither layer can inject custom response headers (S3 only emits a fixed set: `Content-Type`, `Cache-Control`, `Content-Disposition`, `Content-Encoding`, `Expires`; Edge Services has no header-transform stage). As a result, HSTS, `X-Frame-Options`, and `Permissions-Policy` are **not** set on the SPA origin response. API/Yjs/AI domains carry them via Hono `secureHeaders()` middleware. To close this gap, the SPA bucket would need to be fronted by a Caddy/nginx sidecar on the LB path instead of Edge Services.
