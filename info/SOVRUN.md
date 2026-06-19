# Sovrun — feasibility assessment

> Working title for a SaaS that turns Scaleway into a Heroku/Render-like deployment target for
> postgres + TypeScript web apps, built from the cella `infra/` Pulumi program, the GitHub
> Actions deploy pipeline, and the interactive infra CLI. The SaaS itself would be built on the
> cella template. Two principles:
>
> 1. **Customer territory** — workloads, state, and secrets live in the customer's own Scaleway
>    project and GitHub org; Sovrun is a thin control plane over flows the customer could
>    always run themselves with the CLI.
> 2. **Security upgrade, not security trade** — Sovrun must make the customer's deploy process
>    *more* secure than they can cheaply make it alone. It is the trust/federation layer
>    Scaleway doesn't provide, not another custodian to worry about.

Status: research / feasibility. Nothing here is committed work.

## 1. Thesis

The first framing of Sovrun was "a UI over the infra CLI flows". Working through credential
custody sharpened it into something stronger. The current process — like nearly every
small-team cloud deploy — runs on **standing credentials and zero human gates**: anyone who
can push a workflow change to the repo can read every Scaleway key and the Pulumi passphrase,
and deploy anything, silently, with no audit trail (§2.6). Fixing that requires an independent
third party that can verify GitHub's per-run OIDC identity tokens and demand a human approval
before releasing anything — a role a team cannot play for itself, and one Scaleway has no
service for.

So the product thesis, in priority order:

1. **Trust layer** (§3): passkey-gated production deploys, per-run credential release bound to
   GitHub OIDC claims, audit trails, drift detection — making the *existing* pipeline
   measurably more secure, while Sovrun itself stores nothing a leak could monetize.
2. **Heroku-like UX** (§4): a web UI over bootstrap / rotate / apply / secrets, status
   dashboards, a deploy manifest — the on-ramp and the daily surface.
3. **Orchestration layer** (§5): own the long-lived waiting, sequencing, deploy history, and
   scheduled work that GitHub Actions is billed badly for and Pulumi can't express — lifting
   off the customer's plate the pipeline mechanics neither tool is the right host for.

The security inversion resolves the design questions the UX-only frame left open (where
enforcement lives, who holds the passphrase, what the hosted MVP is) — and it is the part of
the product a customer cannot replicate with a weekend of scripting.

## 2. What the current deployment strategy actually is

A precise inventory matters, because the feasibility question is really "how much of this is
already a product, and how much is cella-specific glue".

### 2.1 The three planes

The system already separates into three planes that map directly onto a SaaS architecture:

| Plane | Today | Runs where | Cadence |
|---|---|---|---|
| **Provisioning** (day-0/day-2) | `infra/cli/infra-cli.ts` + `pulumi up` | Operator laptop | Episodic, human-initiated |
| **Delivery** (CI) | `.github/workflows/deploy.yml` | Customer's GitHub Actions | Every push to main |
| **Runtime boot** | cloud-init + `runtime-secret-sync` on immutable VM generations | Customer's VMs | Once per VM generation |

The key observation: **planes 2 and 3 already run entirely inside the customer's accounts**
(their GitHub org, their Scaleway project). Only plane 1 — the episodic CLI flows — is what
Sovrun would put a UI on. The steady-state deploy loop needs no Sovrun involvement at all:
CI builds images, records the release SHA in Pulumi stack config, provisions immutable VM
generations with that SHA baked into cloud-init, and verifies the public services serve the
expected version. This keeps the deploy loop in the customer's GitHub + Scaleway accounts —
the property that makes "no vendor lock-in, no operational dependency on the SaaS" credible.

### 2.2 The credential model (the crown jewel)

Three keys with strictly descending privilege, all minted via direct Scaleway IAM API calls in
[scaleway-iam.ts](../infra/lib/scaleway-iam.ts) (`provisionScopedKey`):

1. **Bootstrap key** — operator-supplied, `IAMManager` + org-level rights. **Never persisted**;
   lives in memory for the duration of a CLI run. Required for setup, CI-key rotation, and
   "Apply infra change" (DB/VPC/PN mutations).
2. **CI deploy key** (`<slug>-ci-deploy`) — scoped permission sets
   ([setup-ci-key.ts](../infra/tasks/setup-ci-key.ts)); read-only on bootstrap-owned resources
   (VPC, private network, RDB). Stored encrypted in the git-tracked stack YAML and pushed to a
   GitHub environment via `gh` ([github-sync.ts](../infra/lib/github-sync.ts)).
3. **VM reader key** (`<slug>-vm-reader`) — read-only registry/S3/Secret Manager (incl.
   `SecretManagerSecretAccess` for decrypt-read). Baked into VM cloud-init.

[pulumi-up.ts](../infra/lib/pulumi-up.ts) even classifies permission failures into
"bootstrap-owned, use Apply mode" vs "CI-grantable, extend the permission set" — that error
taxonomy is product UX waiting to happen.

This model is the single strongest argument for feasibility: it was *designed* so the
highest-privilege credential never touches disk. A SaaS that preserves "bootstrap key is
session-scoped, pasted by the customer, never stored" inherits the security posture instead of
inventing one.

### 2.3 What the CLI flows do (what the UI would wrap)

From [infra-cli.ts](../infra/cli/infra-cli.ts) and `infra/cli/actions/*`:

- **Resume** (idempotent re-run): ensure state bucket → `pulumi login` (S3 backend in the
  customer's project) → stack select → seed generated stack secrets → seed operator secrets to
  Scaleway Secret Manager → gap-check required secrets → provision/heal CI + VM keys → sync
  GitHub environment. 5–7 prompts, **all with env-var fallbacks** — the flow is already
  effectively headless.
- **Rotate keys**: mint fresh CI and VM reader keys, delete old, re-sync GitHub.
- **Apply infra change**: supply a fresh bootstrap key via `SCW_*` env → backup stack YAML →
  set `bootstrap:applyInProgress` marker → `pulumi up` → restore from backup (clears the
  marker). Crash-safe by construction (verbatim file backup, auto-restore offer on next run).
  Provider creds are env-injected, never written to stack config.
- **Preview**: read-only `pulumi preview --diff` with a Scaleway key via `SCW_*` env. No
  mutation; validates provider auth and shows drift.
- **Manage runtime secrets**: list / set / rotate / delete against Scaleway Secret Manager.
  Confirmed stateless — every operation is a pure call against the Secret Manager API with
  injected prompts ([manage-runtime-secrets.ts](../infra/tasks/manage-runtime-secrets.ts)).
  **A web UI can replace this 1:1 today.**

### 2.4 What is already parameterized vs cella-coupled

Already generic (derives from config, not hardcoded):

- All resource naming flows from `appConfig.slug` through [naming.ts](../infra/naming.ts)
  (`deriveInfra`): buckets, registry namespace, IAM app names, secret paths, VM names.
- The service set is a single typed registry (`infra/config/services.config.ts` +
  `lib/services.ts`) with feature flags (`has.yjs`, `has.ai`), per-mode instance types,
  rollover strategy, LB routing, health ports. Every infra module derives from it.
- Runtime secrets are a fork-owned declarative registry
  ([runtime-secrets.config.ts](../infra/config/runtime-secrets.config.ts)) mapping secret →
  consuming services, with `pulumi` vs `operator` value sources.
- appConfig surface consumed by infra is small: `slug`, `mode`, `domain`, `s3.region`,
  feature flags.

Still cella-coupled:

- `shared` appConfig is imported at module-eval time and keyed off `process.env.APP_MODE`
  (set once in `loadContext`). Fine for one-stack-per-process; hostile to multi-tenant
  in-process use. (Per-customer process/container isolation sidesteps this — see §6.2.)
- The compose model assumes this monorepo's Dockerfiles, health endpoints
  (`/health` + `X-App-Version` header contract), and pnpm workspace layout.
- The frontend pipeline (Vite SPA → content-addressed bundle tag → S3 upload → entry-file flip →
  edge purge → served-bundle verification) is cella-shaped, though the *pattern* generalizes to
  any static-bundle SPA.
- deploy.yml itself is a cella artifact a customer would vendor into their repo.

### 2.5 Known fragilities (must-fix before productizing)

These are documented incidents/findings from running this system in production:

1. **VM key split-brain**: two independent writers of `infra:vm*` stack config (deploy.yml
   sync step vs local CLI re-provision) caused a real failed deploy — GitHub env and live IAM
   diverged, reconciler got 403 on tag reads. Needs a single source of truth for key custody.
2. **Three overlapping secret tiers** (stack config secrets, pulumi-owned Secret Manager
   versions, operator-owned containers) with ordering hazards (seed-before-`pulumi up` 409s,
   `getSecretOutput` throwing on missing containers).
3. **Any userdata change replaces all VMs** — reconciler.sh is base64-embedded in cloud-init.
   Acceptable for a template; a product needs userdata-stable updates (fetch reconciler from
   S3 at boot, version it separately).
4. **`gh` CLI dependency** for GitHub sync — assumes local interactive auth; not a service
   primitive.
5. **Pulumi invoked via `spawnSync`** — works for a CLI, but a service wants the Pulumi
   Automation API (streamed events, structured diffs, inline cancellation).

Every one of these is *also* an improvement the template wants regardless of Sovrun. That
overlap is the basis of the phased plan in §8.

### 2.6 Security posture of the status quo

The inventory above is operationally solid but rests entirely on standing credentials:

| Credential | Lives | Readable by | Gate before use |
|---|---|---|---|
| CI deploy key (`SCW_*`) | GitHub env secrets | Anyone with workflow write | None |
| Pulumi passphrase | GitHub env secret (`PULUMI_CONFIG_PASSPHRASE` — CI needs it for `pulumi up`) | Anyone with workflow write | None |
| VM reader key | Stack YAML (encrypted) + VM cloud-init | Passphrase holders; root on any VM | None |
| VM key ciphertext + KDF salt | Git-tracked `Pulumi.<env>.yaml` | Anyone with repo read (offline guessing surface) | Passphrase strength |
| Bootstrap key | Nowhere (session memory only) | — | Human present |

> The provider/CI key was removed from `Pulumi.<env>.yaml`: the Scaleway provider now
> authenticates from `SCW_*` env (GitHub secrets in CI, a pasted bootstrap key locally), so
> the only ciphertext still committed to git is the VM reader key pair. Moving those to Secret
> Manager (§3.3) would close the git-ciphertext surface entirely.

Two structural gaps follow:

- **No human-in-the-loop**: a push to main deploys to production. GitHub required-reviewers
  can gate the *workflow*, but nothing gates the *credentials* — a malicious or compromised
  workflow reads every secret regardless.
- **No audit trail**: there is no record binding "who approved what" to "which credentials
  were used to ship which SHA".

Note also that "the passphrase stays with the customer" purity is already fiction — CI holds
it as a standing secret because `pulumi up` needs it. And the committed ciphertext in
`Pulumi.<env>.yaml` is a real adoption objection: many teams prohibit secrets-in-git
regardless of encryption, and that is exactly the security-conscious EU audience Sovrun
targets. These gaps are not cella flaws — they are the default posture of nearly every
small-team cloud deploy. They are the gap Sovrun exists to close (§3).

## 3. The trust layer — how Sovrun makes the current process more secure

This is the core of the product. Each mechanism below removes a standing credential or adds a
verified human gate, and each was previously an unsolved "where does enforcement live?"
question.

### 3.1 Passkey human-in-the-loop on production deploys

Requiring a WebAuthn/passkey ceremony before any production deploy is the flagship feature —
but the value depends entirely on **where enforcement lives**. If `SCW_*` keys remain static
GitHub secrets, a Sovrun-side passkey prompt is decorative: CI can deploy without asking.
Three real enforcement points, in increasing custody cost:

| Gate | Mechanism | Custody cost |
|---|---|---|
| **1. GitHub deployment protection rule** | GitHub Apps can register as [custom deployment protection rules](https://docs.github.com/en/actions/deployment/protecting-deployments/creating-custom-deployment-protection-rules) on an environment. The Sovrun App gates `production`; the workflow's environment-bound jobs block until a human completes a passkey ceremony in the Sovrun UI; Sovrun approves via REST. | **Zero** — no keys held, works with deploy.yml as-is, stacks with GitHub's native required-reviewers. |
| **2. Credential release** | Secrets are not standing in GitHub; they are released per run after passkey approval (§3.2), or materialized by a Sovrun-mediated executor (§3.3). | Medium. |
| **3. Ephemeral keys per run** | Mint a scoped IAM key per deploy, delete after — real short-lived creds on Scaleway. | High — minting needs an IAMManager-grade credential, which only a customer-side agent should hold (§6.1 model C). |

Gate 1 delivers ~90% of the human-in-the-loop value at ~5% of the cost and is the natural
first hosted feature. Passkey attestation also gives a clean audit log ("who approved which
SHA to production when") — an enterprise capability the current pipeline lacks entirely.

### 3.2 Per-run passphrase release over GitHub OIDC

The strongest single upgrade. GitHub Actions issues per-run OIDC ID tokens
(`permissions: id-token: write`) with verifiable claims: repository, environment, ref, SHA,
run id. Scaleway can't consume these (§6.1) — but **Sovrun can**, acting as the federation
layer Scaleway doesn't provide:

1. `PULUMI_CONFIG_PASSPHRASE` is deleted from GitHub secrets.
2. The deploy job requests its OIDC token and calls Sovrun's release endpoint.
3. Sovrun verifies the token against GitHub's JWKS and checks the claims bind to the exact
   deployment the customer passkey-approved (§3.1 gate 1 — same `environment: production`,
   same SHA), then returns its **share** of the passphrase (§3.4 model P3).
4. CI fetches the customer share from their Secret Manager with the `SCW_*` key it already
   holds, derives the passphrase in run memory (`::add-mask::`), runs `pulumi up`, exits.

What this changes, concretely:

| Property | Status quo (§2.6) | OIDC-released split-share |
|---|---|---|
| Passphrase at rest in GitHub | Yes, standing | **No** |
| Silent read via workflow edit | Yes | No — release requires a passkey-approved deployment of that exact SHA |
| Blast radius of one custodian leak | Full passphrase | A useless half-share |
| Audit trail | None | Every release logged, bound to run id + approver |
| Revocation | Rotate secret, hope | Sovrun stops releasing, instantly, per-customer |

Honest residual: a malicious workflow change that *survives passkey review* still receives
the passphrase for that one run — the human approving the deployment is the control, which is
exactly where you want the control to be. And the lock-in escape stays intact: the customer
holds a full-passphrase break-glass copy (escrow or their password manager); setting it back
as a GitHub secret restores the status quo in one minute, no Sovrun involved. Sovrun being
down blocks production deploys until the customer breaks glass — acceptable, and identical in
kind to GitHub-required-reviewers being unavailable. Implementation-wise the endpoint is
small (verify JWT, check approval record, return share), pairs naturally with the gate-1
GitHub App (same App, same approval record), and needs only an additive deploy.yml change —
no executor architecture required.

### 3.3 Stack config: materialized, not stored

`Pulumi.<env>.yaml` today holds a passphrase-KDF salt, **plaintext** identity values
(IAM application ids, `operatorPrincipal`, `ciPolicyFingerprint`), and the passphrase-encrypted
VM reader key pair (AES-256-GCM, PBKDF2-SHA256/1M, the format decoded in
[pulumi-passphrase.ts](../infra/lib/pulumi-passphrase.ts)). The provider/CI key pair has already
left config (now `SCW_*` env), and `scaleway:projectId` is env-sourced too — the legacy values
linger only until the operator runs `pulumi config rm`. Three observations make the remainder a
legitimate Sovrun concern:

1. **It is already mostly derived, not authoritative.** The provider/CI key pair is no longer
   stored here at all — it was moved to `SCW_*` env (GitHub secrets in CI, pasted bootstrap key
   locally), removing deploy.yml's per-run re-stamp step. The `infra:vm*` keys remain, and still
   have two competing writers (the §2.5 split-brain incident). The git copy is a cache
   pretending to be a source of truth.
2. **Committing ciphertext is a real adoption objection** (§2.6).
3. **Every secret in it has a natural home that already exists**: the customer's Scaleway
   Secret Manager (where operator runtime secrets live today).

Design principle: the stack YAML becomes an ephemeral artifact a flow run writes into its
workspace and discards after:

- Non-secret identity values come from Sovrun's DB — they aren't secrets, storing them is fine
  and gives Sovrun the drift-detection surface the git file used to provide (§3.5).
- Secret values are fetched at run time from the customer's Secret Manager using session/CI
  credentials. The DB passwords already live this way — they auto-generate as
  `random.RandomPassword` resources in Pulumi state, not in stack config (the old orphaned
  `infra:dbPassword` key was removed).
- Sovrun still stores **no secret values** — the §4 premise survives intact. As an optional
  tier, Sovrun can hold the customer's passphrase-encrypted blob as durable backup it cannot
  read (zero-knowledge escrow; customer keeps the passphrase).

Costs and caveats: a bootstrap-ordering problem remains (the CI key that *reads* Secret
Manager must be seeded somewhere first — the GitHub env secret keeps that role); losing the
git-tracked file means losing "clone the repo, run the CLI offline" — the CLI must learn to
materialize from Secret Manager too, which is the same code path a hosted executor needs.
That symmetry is the tell that this is the right refactor: it fixes the split-brain (§2.5
item 1) by *removing* the second writer, rather than coordinating it.

### 3.4 Passphrase custody models

Given §2.6 (the passphrase is already a standing GitHub secret), the question is not "keep
customer purity vs give Sovrun custody" but "is there a custodian better than GitHub". Two
properties bound the risk:

- **Two-factor by construction**: the passphrase alone is useless without the ciphertext
  (state in the customer's S3 bucket, stack config per §3.3). No single Sovrun-side leak
  exposes secrets.
- **Rotation is a bounded recovery** — *if* it's cheap. `pulumi stack
  change-secrets-provider` re-encrypts state under a new passphrase; CI/VM keys already have
  rotate flows; `dbPassword` is the laggard (RDB password change + service roll). A leaked
  passphrase without bucket access is fully recovered by rotating the passphrase alone; with
  bucket access, the underlying secrets must rotate too — so "rotate everything" must be a
  drilled one-click flow, not a runbook.

| Model | Where the passphrase lives | Failure mode | Verdict |
|---|---|---|---|
| **P1. Status quo** | GitHub Actions secret | Repo/workflow compromise reads it silently; no HITL, no audit | The baseline to beat |
| **P2. Release authority** | Customer's Secret Manager, in an **isolated project**; Sovrun holds a read credential it uses only after passkey approval | Sovrun compromise leaks the passphrase (one of the two factors); customer must trust Sovrun's "only after approval" promise | Workable, but Sovrun *can* read it — weaker story than P3 for ~equal build cost |
| **P3. Split-share (recommended)** | Passphrase = KDF(Sovrun share, customer share). Sovrun stores its share; customer's share sits in their Secret Manager. Combined in run memory after passkey approval (§3.2), used, discarded | Either side leaking alone reveals **nothing**. Compromise requires Sovrun DB + customer Secret Manager + customer bucket simultaneously | Best risk/effort ratio; makes the passkey ceremony an actual key-assembly step, not theater |
| **P4. Zero-knowledge escrow** | Sovrun stores a customer-encrypted blob it cannot read (§3.3) | None operationally — but also no operational value; backup/recovery only | Keep as the free tier of custody |

One implementation caution: **Scaleway Secret Manager IAM is project-scoped, not
per-secret.** A passphrase (or share) stored in the same project as runtime secrets is
readable by the CI and VM-reader keys — silently recreating P1. It needs its own project (or
the P3 share design, where same-project placement only exposes a useless half).

### 3.5 Further upgrades the process can't give itself

The same "ask, don't hold" pattern extends, roughly in order of leverage:

- **Standing `SCW_*` keys → scheduled rotation**: Sovrun can't make them per-run (no Scaleway
  federation), but it can drive frequent automatic rotation through the existing
  `provisionScopedKey` flow via a customer-side rotate dispatch — shrinking the exposure
  window from "forever" to days.
- **Policy drift detection**: Sovrun knows the expected `ciPolicyFingerprint`, IAM app ids,
  and permission sets (§3.3 identity data); a daily read-only sweep alerts on grants that
  widened out-of-band — the class of silent change nobody reviews today.
- **Deploy provenance**: the pipeline already cosign-signs images; Sovrun can verify
  signature → approved-SHA → released-passphrase form an unbroken chain and surface it as an
  attestation per release.
- **Anomaly surface**: deploy-tag writes outside an approved run window, status/boot-diag
  divergence, reconciler 403s (the §2.5 split-brain incident would have been an alert, not a
  failed-deploy postmortem).

## 4. What Sovrun would and would not be

**Is:**

- The trust layer of §3: passkey deploy gates, per-run credential release, audit, drift and
  anomaly detection.
- A UI (and eventually hosted control plane) over the four CLI flows: bootstrap, rotate,
  apply infra change, manage runtime secrets.
- A status/observability surface: read deploy metadata, boot diagnostics, and health/version
  signals from the customer's infrastructure; show rollout progress, version drift, and VM
  boot health.
- A manifest editor: the service registry + runtime-secrets registry as customer-editable
  config (the `render.yaml` analog), validated and compiled into the Pulumi program inputs.
- An orchestration surface (§5): drive and watch the deploy the customer's CI/agent executes —
  rollout convergence, expand→contract migration sequencing, deploy history with one-click
  rollback, and scheduled between-deploy work (rotation, drift sweeps, lifecycle).
- A GitHub App that replaces `gh`-CLI sync: writes `SCW_*` secrets/vars into the customer
  repo's environment, optionally scaffolds deploy.yml — and doubles as the §3.1 protection
  rule and §3.2 release endpoint.

**Is not (deliberately):**

- A secrets vault. Secret values live in Scaleway Secret Manager in the customer's project;
  Pulumi state lives in the customer's S3 bucket. Sovrun stores *references, metadata, and at
  most a half-share* (§3.4), never readable values. This is the "leave secret management to
  Scaleway and Pulumi" constraint, and the current code already works that way.
- A build platform. Builds stay in the customer's GitHub Actions (their minutes, their cache,
  their supply chain — incl. the existing cosign keyless signing).
- A runtime proxy. Traffic never touches Sovrun; the customer's LB/Edge Services serve it.

This makes Sovrun closer to **Pulumi Cloud's "thin SaaS over your own state/execution" posture
than to Heroku** — except even thinner, because state is in the customer's bucket and execution
is in the customer's CI. The honest comparison set: Pulumi Cloud + ESC (heavier, multi-cloud),
Porter / Qovery (BYO-cloud PaaS over AWS/GCP k8s), Kamal (CLI-only, no control plane),
SST Console (monitor-your-own-AWS). **Nobody serious occupies the Scaleway niche.** That is
both the opportunity (Scaleway's own PaaS story is weak; EU-sovereignty demand is real and
growing) and the risk (small TAM, single-provider coupling, and Scaleway could ship this
themselves — though the trust-layer role is one Scaleway arguably *shouldn't* play for
itself: an independent approval authority is the point).

## 5. The orchestration layer — work that fits a SaaS better than CI or Pulumi

The first two framings ask what Sovrun should *add* (trust) and what it should *wrap* (UX). A
third asks what the current pipeline runs in the *wrong place*. Several of the gnarliest
mechanics in [deploy.yml](../.github/workflows/deploy.yml) and `infra/` exist not because CI
or Pulumi is the right host for them, but because there was nowhere else to put them. Each is
a candidate to lift into a stateful control plane — and several are work developers would
happily never run in a YAML matrix or a resource graph again.

The tool-fit argument is simple:

- **GitHub Actions is a batch executor.** It runs a job once on an ephemeral, per-minute-billed
  runner with no memory between runs. It is excellent at "build this image", poor at "watch
  this thing converge for five minutes", and actively bad at orchestration expressed as a
  job-dependency DAG with `always() && needs.x.result == 'success'` guards and feature-flag-gated
  JSON matrices assembled in bash.
- **Pulumi is a desired-state reconciler.** It is excellent at "make infrastructure match this
  declaration" and has no vocabulary for imperative, time-ordered sequencing or health
  convergence. The pipeline still concedes this: `pulumi up` can provision the immutable VM
  generation with the release SHA baked in, but the health/version wait and any future explicit
  LB expand/contract cutover live outside Pulumi as deploy tasks.

Neither is a stateful, long-lived orchestrator/observer. The awkward parts of the pipeline are
exactly the parts that need durable state, a clock, and a persistent watcher — which is what a
control plane is.

### 5.1 Convergence and orchestration the pipeline hand-rolls today

| Pipeline mechanic (today) | Why CI/Pulumi is the wrong host | What a control plane does instead |
|---|---|---|
| **Rollout health polling** — `wait-for-version`, `wait-for-images`, `verify-frontend-bundle` (each a 100×3s ≈ 5-min budget) | Holds a paid runner hostage just to poll an HTTP header; the matrix multiplies the idle minutes; a timeout is an opaque red ✗ | A persistent process watches asynchronously — zero runner cost, real backoff, and a live rollout view instead of a spinning job |
| **Deploy sequencing** — roll-backend-first-then-rest, encoded as a job DAG + `if:` guards + bash-built `build_images_matrix` / `roll_rest_matrix` | A hand-rolled workflow engine in YAML; brittle, hard to test, no pause/resume/cancel | A durable-execution state machine expresses "expand → bake → health-gate → contract → verify" natively, with visibility and inline cancellation |
| **Transient-failure retries** — the cosign step's 5-attempt loop for Sigstore HTTP/2 resets | Retry/backoff/idempotency reimplemented in bash, per step | A durable queue gives retry semantics as infrastructure, not shell loops |
| **Failure diagnostics** — failure-only diagnostics dump to the job log, then are gone | No memory: the evidence dies with the runner; no cross-run correlation | Continuously ingest boot, health, and deploy signals; the §2.5 split-brain becomes a standing alert, not a postmortem |

None of this asks Sovrun to *run* the deploy — builds stay in the customer's CI, traffic never
touches Sovrun (§4). It asks Sovrun to *drive and watch* it: trigger the customer's executor
(their CI via `workflow_dispatch`, or a customer-side agent — §6.1 model C), then own the
long-lived waiting, sequencing, and observation that CI is billed badly for and Pulumi can't
express.

### 5.2 The stateful deploy lifecycle — the biggest unlock

The current CI/Pulumi model is still mostly **stateless** from a product point of view:
rollback is "re-run the workflow on the old SHA", and the durable release timeline is spread
across GitHub runs, Pulumi state, and live service health. Three capabilities follow once a
control plane holds the deploy timeline, none of which CI (no memory) or Pulumi (tracks infra,
not releases) can give:

1. **One-click rollback and drift alerts.** The control plane knows which SHA is live on which
  service, when it rolled, and who approved it. Rollback becomes a button; "VM serving SHA ≠
  approved release" becomes an alert.
2. **The missing contract-migration leg.** The pipeline only ever runs the *expand* (additive)
   migration; the destructive *contract* step is dangerous — it must wait for a bake window
   until no instance still runs code referencing the dropped column, so today it is left
   manual. A stateful scheduler can own "run contract migration after bake / N deploys later,
   gated by an approval, with a checked precondition that no VM still serves the pre-contract
   SHA". This is genuinely hard in CI (no state between runs) and impossible in Pulumi (not a
   resource).
3. **Scheduled, between-deploy work.** Key-rotation cadence (§3.5), daily drift sweeps,
   cert-renewal watch, deploy-tag/asset lifecycle, ephemeral-preview TTL cleanup. These need a
   scheduler *with state*; GitHub `schedule:` crons are stateless and noisy, and Pulumi has no
   scheduler. A control-plane job loop is the natural home — and where §3.5's rotation and
   anomaly features actually live.

### 5.3 The boundary, and the honest cost

The line stays where §4 drew it: builds, traffic, and secret *values* never move. The
orchestration layer reads state and drives the customer's own executors; it is not a runtime
dependency. Critically, the **steady-state reconciler keeps converging autonomously** — if
Sovrun is down, the VMs still pull whatever tag is in S3.

The honest cost: moving orchestration into the SaaS reintroduces a central dependency for
*deploys* (not runtime) — exactly the absence §2.1 prized. So every orchestrated flow must be
break-glass-able to the existing deploy.yml: the YAML pipeline stays committed and runnable,
and Sovrun's value is that you rarely want to. This is the same "Sovrun down ⇒ break glass,
status quo restored in a minute" contract the trust layer already accepts (§3.2).

## 6. The hard problems (honest assessment)

### 6.1 Credential custody — the central constraint

Scaleway has **no cross-account role assumption or OIDC federation** (no STS/AssumeRole
equivalent; IAM API is still `v1alpha1`). So a hosted Sovrun cannot get temporary delegated
access to a customer project the way an AWS-based product can. The options for *Scaleway*
credentials (the passphrase has its own answer in §3.2/3.4):

| Model | How | Verdict |
|---|---|---|
| **A. Session-pasted bootstrap key** | Customer pastes bootstrap key into a session; held in memory by an ephemeral per-customer worker; discarded after the flow. Exactly the current CLI contract. | ✅ Preserves the security story. Right default for day-0/day-2 ops. |
| **B. Stored scoped key** | Sovrun stores a CI-grade (not bootstrap) key per customer, encrypted. | ⚠️ Acceptable *only* for read-only status keys (dashboard). Storing write-capable keys contradicts the premise. |
| **C. Customer-side agent/runner** | A small agent in the customer's account (or a dispatch to *their* GitHub Actions via `workflow_dispatch`) executes flows; Sovrun only orchestrates. | ✅ Strongest custody story; more moving parts. Note: "Apply infra change" could literally be a workflow_dispatch in the customer repo — the CLI flows are already headless. |
| D. Browser-local execution | Run flows client-side. | ❌ Pulumi CLI/engine can't run in browser. |

Recommended posture: **A for interactive flows, B (read-only) for dashboards, C as the
long-term direction** — Sovrun as orchestrator of flows that execute in customer territory.
Model C is uniquely enabled by the fact that the CLI is already env-driven and idempotent.

### 6.2 Multi-tenancy of the Pulumi program

The infra program assumes one app/one stack/one process (`APP_MODE` at module-eval,
`spawnSync`, file-based stack YAML in the repo). The realistic answer is **per-customer
ephemeral executors** (container per flow run) rather than re-architecting for in-process
multi-tenancy: each run gets the customer's manifest, hydrates a workspace, materializes
stack config (§3.3), runs the flow, streams events, dies. This also neutralizes the
`process.env` mutation problem and gives isolation between customers' credentials for free.
The Pulumi Automation API's `LocalWorkspace` fits this exactly.

### 6.3 Arbitrary-app generalization

"Postgres + TypeScript" is the right scope statement. What a customer manifest needs:
services (name, Dockerfile path, health endpoint honoring the `X-App-Version` contract, port,
rollover strategy, instance type), optional SPA bundle (build cmd, dist dir), runtime secret
declarations, domain. The existing service registry *is* this manifest, minus a schema and
loader. The two contracts a customer app must implement are small and reasonable:
(1) `/health` returning the running version header; (2) an expand/contract-compatible migration
command for blue-green. Cella forks get both for free — **cella forks are the beachhead
market**, arbitrary apps come later.

### 6.4 Operational surface Sovrun takes on

Even "thin", a control plane means: GitHub App ops, per-customer run executors, Scaleway API
drift (alpha/beta endpoints for IAM, Secret Manager, Edge), supporting customers whose VMs
misbehave (the boot-diag/status plumbing helps a lot here — it was built for exactly this).
The reconciler is 500+ lines of bash embedded in userdata; as a product component it needs
versioned, independently-updatable distribution and a compatibility policy. And the trust
layer raises the stakes: an approval/release service must itself be highly available and
audited — being down blocks customers' production deploys until they break glass (§3.2).

## 7. Feasibility verdict

**Technically: yes, and unusually cheaply.** The architecture was accidentally(?) designed for
this: episodic provisioning is already headless and idempotent; steady-state delivery already
runs in customer accounts with zero central dependency; secrets already live where they should;
the security model's best property (bootstrap key never persisted) transfers intact. The lib
layer is heavily unit-tested pure functions; the secrets flow is web-UI-replaceable today. And
the trust-layer features (§3) need no executor architecture to start — a GitHub App plus a
small OIDC release endpoint upgrades the existing pipeline as-is.

**The binding constraints are not code:** Scaleway's missing credential federation (which is
simultaneously Sovrun's market opening — §3.2 — and its custody burden — §6.1), the small
Scaleway-only market, and the support burden of other people's infrastructure. The biggest
*code* gaps — Automation API adoption, GitHub App, manifest schema, executor isolation, fixing
the §2.5 fragilities — are each independently valuable to the template.

**Strategic fit:** building Sovrun on cella itself is coherent (it's exactly the
"context entity = customer org, product entity = stack/deployment/run" shape cella models),
and dogfooding the deploy system to ship the deploy product is a tight loop.

## 8. Phased groundwork (no-commitment path)

Each phase improves the current deployment logic on its own merits. The Sovrun decision can be
deferred until after phase 3 with nothing wasted.

### Phase 0 — Harden what exists (pure template work)

- Fix the VM-key split-brain: one writer for `infra:vm*` / GitHub `VM_*` (decide: GitHub env is
  source of truth, CLI reads and never silently re-mints).
- Collapse the secret tiers' ordering hazards: always-create containers, seed strictly after
  `pulumi up`, or import live containers into state.
- Decouple reconciler.sh from userdata (fetch versioned script from S3 at boot) so reconciler
  updates stop replacing VMs.
- **Ship the rotate-everything flow** (compose existing rotate primitives +
  `pulumi stack change-secrets-provider` + the `dbPassword` leg). Every custody model's worst
  case ends in "rotate fast" (§3.4), and the capability is valuable even if Sovrun never
  happens.
- Exit criteria: a fresh fork bootstraps to green production with zero manual Scaleway-console
  interventions, twice in a row; passphrase rotation is one command.

### Phase 1 — Headless core as a real seam

- Extract the flow logic out of `infra/cli/actions/*` into pure, prompt-injected functions
  (the secrets flow already does this with `RuntimeSecretPrompts` — replicate the pattern for
  setup/rotate/apply). CLI becomes one thin adapter; a web UI becomes another.
- Replace `spawnSync('pulumi', ...)` with the Pulumi Automation API (`LocalWorkspace`),
  gaining structured event streams and previews. Keep behavior identical.
- Replace `gh` CLI calls with direct GitHub REST (token-injected) in github-sync — testable,
  and the future GitHub App uses the same code path.
- Exit criteria: `infra-cli` flows runnable end-to-end from a single programmatic entry point
  with injected credentials and an event callback; CI-friendly integration test proves it.

### Phase 2 — Manifest extraction

- Define a versioned schema for the deploy manifest: the service registry +
  runtime-secrets registry + domain/region/flags, loaded from a file instead of TypeScript
  imports of `shared`. cella's own config compiles *to* this manifest (no fork-visible change).
- Remove the remaining module-eval `APP_MODE` coupling: infra takes a resolved manifest as
  input, not an env-keyed global import.
- Begin the §3.3 materialization on the template side: stack secrets readable from Secret
  Manager, git-tracked stack YAML demoted to identity-only (or dropped).
- This is the same lever the MULTI_FORK_SHARING.md plan calls the "derived deploy-plan
  artifact" — one piece of work serves both directions.
- Exit criteria: the Pulumi program provisions from a manifest file; a second toy app
  (different service set) deploys from its own manifest using unmodified infra code.

### Phase 3 — Local dashboard ("Sovrun, single-player")

- Ship a **localhost web UI** over the phase-1 seam: status dashboard (S3 status/tags/boot-diag
  with the read-only key), runtime secrets management, rollout view, and guided
  bootstrap/rotate/apply with session-only credentials. No hosting, no tenancy, no custody
  problem — it runs on the operator's machine like the CLI does.
- This is the cheapest possible market test: if cella fork operators (and you) don't prefer it
  over the CLI, a hosted version has no demand signal worth pursuing.
- Exit criteria: you stop using the CLI for day-2 ops; ≥1 external fork operator does too.

### Phase 4 — Hosted trust layer (the actual commitment)

Only past this line does SaaS-specific work begin. The MVP is the §3 core: one GitHub App
acting as **passkey deployment-protection gate (§3.1) + OIDC passphrase release (§3.2)** —
it holds no monetizable secrets (at most a half-share, §3.4 P3) but makes the customer's
existing pipeline measurably more secure than they can make it alone: no standing passphrase,
human-in-the-loop, audit trail. Then, in rough order: drift/anomaly detection (§3.5),
per-customer ephemeral flow executors (§6.1 models A/C, §6.2), full stack-config
materialization (§3.3), customer/org/billing model on cella, manifest editor UI, support
tooling. Decision inputs by then: phase-3 adoption, Scaleway IAM roadmap (federation would
change the custody math), and whether Scaleway shows signs of building this natively.

## 9. Open questions
  their share (P4 escrow covers Sovrun-side loss), and the rotate-everything flow's
  `dbPassword` leg (RDB password change + coordinated service roll).
- Trust-layer availability (§6.4): what SLA does an approval/release service owe when being
  down blocks customer production deploys? Break-glass is the floor; is multi-region the
  ceiling, or status-page honesty?
- Staging/preview environments: the stack model supports it (`Pulumi.staging.yaml`), but
  per-PR previews would need cost-bounded ephemeral stacks — out of MVP scope.
- Does Sovrun scaffold deploy.yml into customer repos (template + updates = a sync problem,
  see `cli/cella`) or provide a reusable workflow (`uses: sovrun/deploy@v1`)? The reusable
  workflow is the more product-shaped answer — and the natural place to weave in the §3.2
  release call — worth prototyping in phase 2–3.
- Pricing surface: with workloads, builds, and state all customer-side, what's billed is the
  trust layer + control plane + support — closer to Pulumi Cloud per-stack pricing than
  Heroku per-dyno.
