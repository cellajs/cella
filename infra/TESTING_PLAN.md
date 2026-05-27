# Infra Testing Plan

A prioritised plan for closing test gaps in the `infra/` package, with a
security/privacy lens. Each entry lists:

- **Target** — file(s) under test
- **Risk** — what breaks if this regresses
- **Recipe** — concrete shape of the test
- **LOC** — rough lines of code for the test file (incl. setup, excl. shared harness)
- **Robustness** — how resilient the test is to unrelated refactors
  - `High` — asserts on a behavioural contract that rarely changes
  - `Med` — asserts on a structural shape; will need touch-ups on intentional changes
  - `Low` — snapshot/fixture-heavy; will churn often
- **Triviality** — how mechanical the test is to write
  - `Trivial` — pure function, no mocks
  - `Easy` — one mock or fixture
  - `Moderate` — requires Pulumi mocking harness or multi-step setup
  - `Hard` — real network, real Pulumi engine, or hand-rolled crypto fixtures

> **Current coverage**: 1 test file ([`tasks/setup-ci-key.test.ts`](tasks/setup-ci-key.test.ts), 5 tests). 10 modules + 6 scripts + `helpers.ts` + `naming.ts` + `index.ts` are uncovered.

---

## Alignment with Pulumi's testing pyramid

Pulumi documents [three testing styles](https://www.pulumi.com/docs/iac/concepts/testing/); each gap below is tagged with the tier(s) it belongs to.

| Tier | What it does | Speed | Validates | Best for |
|------|--------------|-------|-----------|----------|
| **Unit** (`pulumi.runtime.setMocks`) | Replaces the Pulumi engine with in-process mocks; asserts on resource **inputs** | ms | Program logic, naming, input shape | Naming derivations, IAM permission lists, SG rule construction |
| **Property** ([CrossGuard / Policy as Code](https://www.pulumi.com/docs/iac/concepts/policy-as-code/)) | Policy Pack runs inside the Pulumi CLI during `preview`/`up`; sees real **inputs + outputs** from the provider | seconds | Cross-cutting invariants ("no public buckets", "TLS >= 1.2") | Security guardrails that must hold across every stack and every PR |
| **Integration** ([Automation API](https://www.pulumi.com/docs/iac/concepts/testing/integration/)) | Programmatically does `up` → assert against live endpoints → `destroy` | minutes | Real cloud behaviour, HTTPS headers, reachability | HSTS/CSP probes, TLS chain checks, port-closed scans |

**Industry parallels**: this maps onto the Terraform world's `terraform-compliance`/Checkov (unit/policy) + Terratest (integration) split. The OWASP IaC Top 10 maps almost 1:1 onto the §1 list below; we're not inventing categories, we're filling Pulumi-native versions of them.

**Recommended split for this repo**:
- §1.1, §1.2, §1.3, §2.1, §3.* → **Unit** (no Pulumi runtime needed; pure logic)
- §1.4, §1.5, §2.2–2.7, §4.* → **Policy Pack** (security invariants — Pulumi-recommended approach; far more robust than mock-based unit tests because the policy evaluates real outputs and runs on every `pulumi up`)
- §1.6 → **Unit** (Output shape) + **Integration** (post-deploy MDS check)
- §5 → **Integration** (Automation API + HTTP/TLS probes)

> A Policy Pack lives in `infra/policies/` as a sibling Pulumi project, written in TypeScript with `@pulumi/policy`. With the self-hosted Scaleway state bucket as the Pulumi backend, the `pulumi policy enable` workflow (which writes the binding to Pulumi Cloud) is **not available**. Instead, we run policy packs **locally** by passing `--policy-pack ./policies` on every `pulumi preview` / `pulumi up`. The CI workflow wraps both commands so the flag is never forgotten — a misconfigured PR fails the preview job before merge.

---

## 0. Shared harness (prerequisite)

Before any unit-tier module tests, build a small Pulumi mocking helper following the [official `setMocks` recipe](https://www.pulumi.com/docs/iac/concepts/testing/unit/#add-mocks). Everything in §2 depends on it.

**Critical rule from the docs**: the program (`index.ts` or a module) must be `import()`-ed **after** `setMocks` is called, otherwise resources are constructed against the real engine and the test silently fails or hangs. The dynamic `await import(importPath)` in the helper enforces this.

**Also**: mock both `newResource` (per-resource constructors) AND `call` (provider data-source lookups — e.g. `scaleway:account/getProject`, `scaleway:instance/getImage`). Without a `call` mock, modules using data-source lookups reject during the test.

**File**: `tests/helpers/pulumi-mock.ts`

```ts
import * as pulumi from '@pulumi/pulumi'

export type RenderedResource = { type: string; name: string; inputs: Record<string, unknown> }

export async function renderModule(
  importPath: string,
  opts: { project?: string; stack?: string; dryRun?: boolean; callMocks?: Record<string, unknown> } = {},
): Promise<RenderedResource[]> {
  const captured: RenderedResource[] = []
  pulumi.runtime.setMocks(
    {
      newResource: (args) => {
        captured.push({ type: args.type, name: args.name, inputs: args.inputs })
        return { id: `${args.name}-id`, state: args.inputs }
      },
      call: (args) => opts.callMocks?.[args.token] ?? args.inputs,
    },
    opts.project ?? 'infra',
    opts.stack ?? 'test',
    opts.dryRun ?? false, // set true to exercise preview-only branches
  )
  await import(importPath) // MUST be after setMocks
  return captured
}

// Helper for awaiting Output<T> values inside assertions
export function unwrap<T>(o: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve) => o.apply(resolve as (v: T) => void))
}
```

- **LOC**: ~55
- **Robustness**: High (Pulumi mock API is stable)
- **Triviality**: Easy

---

## 1. Security-critical (do these first)

### 1.1 Stack YAML secret-marking linter — **Tier: Unit**
- **Target**: `Pulumi.production.yaml`, future `Pulumi.staging.yaml`
- **Risk**: Plaintext secret committed to git. Single largest blast radius.
- **Recipe**: Parse YAML, walk `config:` keys. For every key in a known-secret
  allowlist (`scaleway:secretKey`, `scaleway:accessKey`, `infra:dbPassword`,
  `infra:cookieSecret`, `infra:cdcSecret`, `infra:yjsSecret`, `BREVO_API_KEY`,
  any key ending in `Secret|Password|Key|Token`), assert the value is an object
  with a `secure:` field (Pulumi's encrypted form), not a bare string.
- **LOC**: ~60
- **Robustness**: High — contract is "secrets must be encrypted", which never
  legitimately changes.
- **Triviality**: Trivial (just `yaml.parse` + assertions)

### 1.2 IAM permission-set lockdown — **Tier: Unit**
- **Target**: `tasks/setup-ci-key.ts`
- **Risk**: Someone adds `IAMManager` or `ProjectManager` to the CI key's
  permission sets, turning it into a self-rotating super-key.
- **Recipe**: Export `PROJECT_PERMISSION_SETS` and `ORG_PERMISSION_SETS`. Assert
  exact membership (snapshot-like but tiny): any addition forces an explicit
  test edit, which forces a code-review conversation.
- **LOC**: ~25 (+ 2-line export change)
- **Robustness**: Med — will need updating when permissions genuinely change,
  but that's the point.
- **Triviality**: Trivial

### 1.3 `pulumi-passphrase.ts` crypto round-trip — **Tier: Unit**
- **Target**: `src/pulumi-passphrase.ts` (PBKDF2-SHA256 1M iter / AES-256-GCM)
- **Risk**: Hand-rolled crypto. A salt/nonce/iteration off-by-one silently
  decrypts garbage during bootstrap, or worse, accepts tampered ciphertext.
- **Recipe**:
  1. Commit a small fixture YAML encrypted via the real Pulumi CLI with a known
     test passphrase (never a real secret).
  2. Round-trip test: decrypt → assert known plaintext.
  3. Negative: wrong passphrase throws.
  4. Negative: truncated ciphertext throws.
  5. Negative: tampered ciphertext throws (GCM auth tag rejects).
  6. Known-answer vector: hardcoded ciphertext + key → known plaintext (locks
     the algorithm so a refactor can't silently switch to AES-CBC).
- **LOC**: ~90
- **Robustness**: High — crypto contracts don't drift.
- **Triviality**: Moderate (need to generate fixtures once with real Pulumi CLI)

### 1.4 Security group ingress rules — **Tier: Policy Pack (preferred) + Unit**
- **Target**: `modules/network.ts`, `modules/compute.ts`
- **Risk**: A regex/typo opens 22 / 5432 / 6432 / Redis port to `0.0.0.0/0`.
- **Note**: This is literally [Pulumi's own canonical unit-test example](https://www.pulumi.com/docs/iac/concepts/testing/unit/#sample-program) — validates the gap is well-aimed. Implement both:
  1. **Policy Pack** (`infra/policies/`): a `ResourceValidationPolicy` rule that runs on every `pulumi up`. Enforced for all stacks; cannot be bypassed by skipping CI.
  2. **Unit test** (with §0 harness): faster local feedback during module edits.
- **Recipe (Policy Pack)**:
  ```ts
  new PolicyPack('security', { policies: [{
    name: 'no-open-ssh',
    enforcementLevel: 'mandatory',
    validateResource: validateResourceOfType(scaleway.network.SecurityGroup, (sg, args, reportViolation) => {
      if (sg.inboundDefaultPolicy !== 'drop') reportViolation('SG default must drop')
      for (const rule of sg.inboundRules ?? []) {
        if (rule.ipRange === '0.0.0.0/0' && [22,5432,6432,6379].includes(rule.port)) {
          reportViolation(`Port ${rule.port} must not be open to 0.0.0.0/0`)
        }
      }
    }),
  }]})
  ```
- **LOC**: ~70 (Policy) + ~40 (Unit smoke test)
- **Robustness**: High
- **Triviality**: Moderate

### 1.5 Object Storage bucket ACL/CORS — **Tier: Policy Pack (preferred) + Unit**
- **Target**: `modules/storage.ts`
- **Risk**: Private bucket flipped to public; public bucket gets `*` CORS with
  credentials.
- **Recipe**:
  - Private buckets: `acl === 'private'`, no bucket policy with
    `Principal: '*'`.
  - Frontend (intentionally public) bucket: `acl === 'public-read'`, CORS
    `allowed_origins` is the app domain (not `*`) when credentials are used.
  - Production: versioning enabled on private buckets; lifecycle rules present
    for backup buckets.
- **LOC**: ~80
- **Robustness**: High
- **Triviality**: Moderate (harness)

### 1.6 Cloud-init userdata secret handling — **Tier: Unit + Integration**
- **Target**: `modules/compute.ts`
- **Risk**: A secret accidentally `.apply()`d into a plain string, ending up
  unencrypted in Pulumi state and node metadata service.
- **Recipe**: Walk rendered `user_data` inputs. Assert it is a
  `pulumi.Output` (encrypted in state) rather than a bare `string`. If string,
  grep for known token shapes (`SCW...`, JWT-like, hex 32+) and fail.
- **LOC**: ~50
- **Robustness**: Med — `user_data` shape may change with cloud-init refactors.
- **Triviality**: Moderate

---

## 2. High-value structural tests

### 2.1 `naming.ts` derivations — **Tier: Unit**
- **Target**: `naming.ts` (`deriveInfra`)
- **Risk**: A slug/domain change collides bucket names, or
  `registryNamespace` keeps a hyphen and breaks Scaleway constraints.
- **Recipe**: Pure-function tests:
  - `registryNamespace` never contains `-`
  - `pulumiStateBucket === '${prefix}-pulumi-state'`
  - `frontendBucket`, `privateBucket`, `publicBucket` are pairwise unique
  - `domains.api` parses correctly for `http://localhost:4000` (dev) and a real
    HTTPS URL
  - `hasDomain` is `false` for localhost, `true` for real domains
  - `isProduction` is true only for the `production` stack
- **LOC**: ~80
- **Robustness**: High
- **Triviality**: Trivial (no mocks)

### 2.2 TLS minimum version & HTTP redirect — **Tier: Policy Pack**
- **Target**: `modules/loadbalancer.ts`
- **Risk**: TLS 1.0/1.1 left enabled; an HTTP-only frontend exists.
- **Recipe**:
  - Every TLS frontend has `tls_min_version >= '1.2'`
  - No frontend is HTTP-only except a dedicated redirect frontend
  - Redirect frontend forwards to HTTPS with 301/308
- **LOC**: ~50
- **Robustness**: High
- **Triviality**: Moderate

### 2.3 Database privacy posture — **Tier: Policy Pack**
- **Target**: `modules/database.ts`
- **Risk**: Public IP enabled; backups disabled; retention shrunk.
- **Recipe**:
  - `is_ha_cluster === true` in production
  - No `endpoint` with `public: true`
  - `backup_same_region === false` (cross-region)
  - `backup_schedule_retention >= 7`
  - `volume_type` matches the documented choice (locks accidental downgrades)
- **LOC**: ~60
- **Robustness**: High
- **Triviality**: Moderate

### 2.4 DNS hardening — **Tier: Policy Pack + Integration**
- **Target**: `modules/dns.ts`
- **Risk**: Missing CAA → any CA can issue for your domain. Missing DMARC →
  email spoofable.
- **Recipe**:
  - When `hasDomain`, assert presence of records: `app`, `api`, `yjs`, `ai`
  - Assert CAA record restricting issuance to chosen CA(s)
  - Assert DMARC TXT record with `p=quarantine` or `p=reject` for prod
- **LOC**: ~55
- **Robustness**: Med (DNS policy may legitimately evolve)
- **Triviality**: Moderate

### 2.5 WAF enabled in production (edge) — **Tier: Policy Pack**
- **Target**: `modules/edge.ts`
- **Risk**: `infra.enableWaf` flipped, or WAF in `detect` mode in production.
- **Recipe**: Render once with `APP_MODE=production`, once with `=staging`.
  Assert prod attaches a WAF rule set in `block` mode; staging respects the
  config flag.
- **LOC**: ~50
- **Robustness**: High
- **Triviality**: Moderate

### 2.6 Secrets module exports — **Tier: Policy Pack**
- **Target**: `modules/secrets.ts`
- **Risk**: A new secret added as a plain `Output<string>` instead of a Pulumi
  secret output, leaking into stack outputs in plaintext.
- **Recipe**: Render module; for each exported value in the secrets bag,
  assert `pulumi.isSecret(value)` resolves true.
- **LOC**: ~40
- **Robustness**: High
- **Triviality**: Moderate

### 2.7 Monitoring labels don't carry PII — **Tier: Policy Pack**
- **Target**: `modules/monitoring.ts`
- **Risk**: Cockpit/metrics labels include `userId`, `email`, `ip` →
  high-cardinality and a GDPR problem.
- **Recipe**: Walk every `labels` / `tags` inputs object. Assert keys are drawn
  from a hardcoded allowlist (`env`, `app`, `module`, `region`, …).
- **LOC**: ~45
- **Robustness**: High
- **Triviality**: Moderate

---

## 3. Operational tests

### 3.1 `bootstrap.ts` stack-file parsing
- **Target**: `tasks/bootstrap.ts`
- **Risk**: The regex that detects already-bootstrapped stacks misfires →
  duplicate IAM apps or skipped setup.
- **Recipe**: Feed it inline YAML strings (no fs); assert the detection
  boolean. Pure function once extracted.
- **LOC**: ~40
- **Robustness**: High
- **Triviality**: Trivial (after a small extract-function refactor)

### 3.2 `ensure-state-bucket.ts` idempotency
- **Target**: `tasks/ensure-state-bucket.ts`
- **Risk**: Bucket re-creation attempt or wrong-region creation.
- **Recipe**: Mock Scaleway SDK / fetch. Assert: exists → no-op; missing →
  one CreateBucket call with the expected region/ACL; non-404 error
  propagates.
- **LOC**: ~70
- **Robustness**: Med
- **Triviality**: Easy

### 3.3 `init-stack-secrets.ts` spec snapshot
- **Target**: `tasks/init-stack-secrets.ts`
- **Risk**: Secret length silently shrunk (e.g. cookie secret from 64→16
  bytes).
- **Recipe**: Export the spec table (`{name, bytes, encoding}[]`). Snapshot-test
  it. Forces a code-review on any rotation parameter change.
- **LOC**: ~25
- **Robustness**: Med
- **Triviality**: Trivial

### 3.4 `print-deploy-env.ts` masking
- **Target**: `tasks/print-deploy-env.ts`
- **Risk**: Secret values printed unmasked to GH Actions logs.
- **Recipe**: Pipe a fake stack-outputs object through the formatter; assert
  any key matching the secret allowlist is rendered as `***` (or omitted).
- **LOC**: ~40
- **Robustness**: High
- **Triviality**: Easy

### 3.5 Image-tag pin guard
- **Target**: `helpers.ts` (existing runtime check)
- **Risk**: A `:latest` tag in production deployment.
- **Recipe**: Lift the runtime guard into a pure helper and unit-test it for
  `:latest`, missing tag, sha256 digest (allowed), normal tag (allowed).
- **LOC**: ~30
- **Robustness**: High
- **Triviality**: Trivial

---

## 4. Cross-cutting "golden invariants"

These are full-graph snapshot tests using the §0 harness on `index.ts`.
They are higher-churn but catch entire classes of regression.

### 4.1 No unexpected public resources
- **Recipe**: Render the whole program. For every resource, if it has a
  `public_*` or `acl` field, assert it's in a known allowlist (`{frontend-bucket}`).
  Any new "public" thing forces an explicit allowlist edit.
- **LOC**: ~60
- **Robustness**: Med (allowlist will grow)
- **Triviality**: Moderate

### 4.2 Registry image origin
- **Target**: `modules/compute.ts`, `modules/registry.ts`
- **Risk**: A container image URL points outside our registry namespace
  (supply-chain / exfiltration risk via untrusted images).
- **Recipe**: For every container image reference in cloud-init, assert it
  starts with `rg.{region}.scw.cloud/{registryNamespace}/`.
- **LOC**: ~35
- **Robustness**: High
- **Triviality**: Moderate

### 4.3 Tag/label namespace
- **Recipe**: Every Scaleway resource has `tags` including `env`, `app`,
  `managed-by=pulumi`. Mostly catches drift between modules.
- **LOC**: ~30
- **Robustness**: Low (tag conventions evolve)
- **Triviality**: Moderate

---

## 5. Integration tests (Automation API)

Pulumi's [Automation API](https://www.pulumi.com/docs/iac/concepts/testing/integration/automation-api/) (Node.js) lets us spin up an **ephemeral staging stack**, run probes against the live endpoints, then `destroy()` — all from Vitest. This replaces "manual post-deploy checks" with executable specs.

**Trade-off**: a full `up`/`destroy` cycle for the production stack takes ~10–20 min and costs real Scaleway credits per run. Recommended cadence: nightly on `main`, plus on-demand via a GitHub Actions `workflow_dispatch` for release branches — not per-PR.

### 5.1 Harness — `tests/integration/ephemeral-stack.ts`
- **Recipe**: wrap `LocalWorkspace.createOrSelectStack`, deterministic `stackName = \`it-${shortSha}-${runId}\``, `before()` does `up`, `after()` does `destroy`. Stack name and project are isolated so parallel CI runs don't collide.
- **LOC**: ~80
- **Robustness**: High
- **Triviality**: Moderate

### 5.2 HTTPS hardening probe
- **Targets**: SPA origin, API, Yjs, AI endpoints
- **Checks**: HSTS header present with `max-age >= 31536000; includeSubDomains`; `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; no `Server:` banner leaking versions.
- **LOC**: ~70
- **Robustness**: High
- **Triviality**: Easy (just `fetch` + header assertions)

### 5.3 TLS chain & cipher probe
- **Tool**: `tls.connect()` from Node `tls` module, or shell out to `openssl s_client`.
- **Checks**: certificate validates against system roots; SAN includes all 4 subdomains; TLS 1.2 minimum negotiated; no weak ciphers (RC4, 3DES, NULL).
- **LOC**: ~60
- **Robustness**: High
- **Triviality**: Moderate

### 5.4 Port-closed scan
- **Risk**: SG rule allows a port unintentionally.
- **Recipe**: `net.createConnection()` against `host:port` for the denylist (22, 5432, 6432, 6379, 9090); each should `ECONNREFUSED` or time out.
- **LOC**: ~40
- **Robustness**: High
- **Triviality**: Easy

### 5.5 Backup restore drill (out of scope for CI)
- Should be a scheduled (quarterly) manual runbook, not Vitest. Document the procedure in [`README.md`](README.md) under "DR drills" so the obligation is explicit even without code coverage.

---

## Summary table

| # | Test | Tier | LOC | Robustness | Triviality | Priority |
|---|------|------|-----|------------|------------|----------|
| 0 | Pulumi mock harness | Unit | 55 | High | Easy | **P0** (prereq) |
| 1.1 | Stack YAML secret-mark linter | Unit | 60 | High | Trivial | **P0** |
| 1.2 | IAM permission-set lockdown | Unit | 25 | Med | Trivial | **P0** |
| 1.3 | `pulumi-passphrase` crypto round-trip | Unit | 90 | High | Moderate | **P0** |
| 1.4 | Security group ingress | Policy + Unit | 110 | High | Moderate | **P0** |
| 1.5 | Bucket ACL / CORS | Policy + Unit | 80 | High | Moderate | **P0** |
| 1.6 | Cloud-init secret handling | Unit + Int. | 50 | Med | Moderate | P1 |
| 2.1 | `naming.ts` derivations | Unit | 80 | High | Trivial | **P0** |
| 2.2 | LB TLS & redirect | Policy | 50 | High | Moderate | P1 |
| 2.3 | Database privacy posture | Policy | 60 | High | Moderate | P1 |
| 2.4 | DNS hardening (CAA/DMARC) | Policy + Int. | 55 | Med | Moderate | P1 |
| 2.5 | WAF in production | Policy | 50 | High | Moderate | P1 |
| 2.6 | Secrets module marked-secret | Policy | 40 | High | Moderate | P1 |
| 2.7 | Monitoring label PII allowlist | Policy | 45 | High | Moderate | P2 |
| 3.1 | `bootstrap` stack-file parsing | Unit | 40 | High | Trivial | P2 |
| 3.2 | `ensure-state-bucket` idempotency | Unit | 70 | Med | Easy | P2 |
| 3.3 | `init-stack-secrets` spec snapshot | Unit | 25 | Med | Trivial | P2 |
| 3.4 | `print-deploy-env` masking | Unit | 40 | High | Easy | P2 |
| 3.5 | Image-tag pin guard | Unit | 30 | High | Trivial | P2 |
| 4.1 | No-unexpected-public golden | Policy | 60 | Med | Moderate | P2 |
| 4.2 | Registry image origin | Policy | 35 | High | Moderate | P1 |
| 4.3 | Tag namespace | Policy | 30 | Low | Moderate | P3 |
| 5.1 | Ephemeral-stack harness | Integration | 80 | High | Moderate | P2 |
| 5.2 | HTTPS hardening probe | Integration | 70 | High | Easy | P1 |
| 5.3 | TLS chain & cipher probe | Integration | 60 | High | Moderate | P2 |
| 5.4 | Port-closed scan | Integration | 40 | High | Easy | P2 |

**Totals**: ~1,425 LOC across 26 test files. ~470 LOC of that is the **P0**
bundle (8 files), which closes the highest-risk gaps.

**Breakdown by tier**: ~525 LOC Unit, ~650 LOC Policy Pack, ~250 LOC Integration. Matches Pulumi's recommended pyramid (broad unit base, focused policy middle, narrow integration top).

## Suggested first PR

1. §0 harness
2. §1.1 stack-YAML linter
3. §1.2 IAM permission-set lockdown (with `export` change)
4. §2.1 `naming.ts` derivations

~220 LOC, no Pulumi-runtime dependency beyond §0, lands the highest
security-ROI tests with minimal blast radius if anything misbehaves.

## Suggested second PR — Policy Pack scaffold

1. Create `infra/policies/` as a sibling Pulumi project with `@pulumi/policy`
2. Implement §1.4 (SG ingress) + §1.5 (bucket ACL) + §2.6 (secret marking) as a single starter pack
3. Wire `pulumi preview --policy-pack ./policies` and `pulumi up --policy-pack ./policies` into the CI workflow and into [`package.json`](package.json) scripts, so the flag is impossible to forget
4. Run against staging first, prove green, then turn the same flag on for production deploys

Once the Policy Pack is in place, §2.2–2.7 and §4.* become quick additions (each is a ~20–30 LOC rule in the same project). It runs on every `pulumi up`, so a misconfigured PR fails to deploy rather than relying on CI vigilance — provided the `--policy-pack` flag is hard-wired into the CI workflow (it is in our case, since we control both).

---

## Self-hosted backend constraints

The Pulumi backend for this repo is a **self-hosted Scaleway Object Storage bucket** (see [`tasks/ensure-state-bucket.ts`](tasks/ensure-state-bucket.ts) and [`src/pulumi-passphrase.ts`](src/pulumi-passphrase.ts)). That choice rules out several otherwise-recommended Pulumi practices, and shapes the plan accordingly.

| Pulumi Cloud feature | Why excluded | Self-hosted substitute used in this plan |
|----------------------|--------------|------------------------------------------|
| Pulumi ESC (secrets env) | Cloud-only | Stack YAML `secure:` blocks + §1.1 linter + §1.3 passphrase crypto tests |
| Review Stacks (ephemeral PR envs) | Cloud-only | §5.1 Automation API harness with deterministic stack names |
| Pulumi GitHub App PR comments | Cloud-only | `pulumi/actions` step in CI posts preview output to PR via plain `gh pr comment` |
| `pulumi policy enable` | Writes binding to Cloud | Local `--policy-pack ./policies` flag wired into CI + package.json scripts |
| Drift detection (scheduled) | Cloud feature | Optional self-hosted: nightly `pulumi preview --expect-no-changes` job in CI |
| OIDC token exchange for `pulumi login` | Cloud-only | IAM-key flow in [`setup-ci-key.ts`](tasks/setup-ci-key.ts) — §1.2 lockdown test stays load-bearing |

None of the §1–§5 testing tiers (Unit / Policy / Integration) require Pulumi Cloud — the language SDKs (`@pulumi/pulumi`, `@pulumi/policy`) and Automation API all run fully against the self-hosted backend. The plan below is the **final** plan, not a draft awaiting Cloud migration.

### Adaptations baked in

- **§1.1 (YAML secret-mark linter)** — keeps the original assertion ("every secret key must be `secure:`-encrypted in `Pulumi.<stack>.yaml`"). ESC's stronger "no secrets in YAML at all" rule is unreachable without Cloud, so the encryption-required form is our top guarantee.
- **§1.3 (`pulumi-passphrase.ts` crypto)** — stays load-bearing exactly because we don't have ESC. The hand-rolled AES-GCM exists specifically to handle the bootstrap-before-`pulumi login` chicken-and-egg problem with a self-hosted backend; the test suite must defend it.
- **§1.2 (IAM permission-set lockdown)** — stays load-bearing exactly because we don't have OIDC; the long-lived IAM key is real, so locking down its permission sets is the primary guard.
- **§1.4, §1.5, §2.*, §4.*** — implemented as a local Policy Pack invoked via `--policy-pack ./policies`. Mechanically identical to a Cloud-enabled pack; we just pass the flag explicitly.
- **§4.1** — implemented with `StackValidationPolicy` (whole-graph view) following the [`stackvalidation-ts`](https://github.com/pulumi/examples/tree/master/policy-packs/stackvalidation-ts) example, which works the same on a self-hosted backend.
- **§5.1** — full Automation API harness as originally specified; no Review Stacks substitute. The 80 LOC is the price of not using Cloud.

### CI workflow shape (self-hosted)

A single GitHub Actions workflow at `.github/workflows/infra-ci.yml` covers all tiers without any Cloud-specific actions. Rough shape:

```yaml
jobs:
  unit-and-policy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v4
        with:
          path: ~/.pulumi/plugins
          key: pulumi-plugins-${{ hashFiles('infra/package.json') }}
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter infra test           # §1.1–1.3, §2.1, §3.*
      - run: pulumi preview --policy-pack ./infra/policies --expect-no-changes=false  # §1.4–1.5, §2.2–2.7, §4.*
        env:
          PULUMI_CONFIG_PASSPHRASE: ${{ secrets.PULUMI_CONFIG_PASSPHRASE }}
          SCW_ACCESS_KEY: ${{ secrets.SCW_ACCESS_KEY }}
          SCW_SECRET_KEY: ${{ secrets.SCW_SECRET_KEY }}
  integration-nightly:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - run: pnpm --filter infra test:integration  # §5.1–5.4
```

- `actions/cache@v4` for `~/.pulumi/plugins` — pure speedup, backend-independent.
- No `pulumi/auth-actions`, no `comment-on-pr`, no Review Stack URL output — none of that lights up without Cloud.
- Trunk-based cadence:

| Trigger | Tests that run |
|---------|----------------|
| PR opened/updated | §1, §2 (Unit + local Policy Pack via `pulumi preview --policy-pack`) |
| Push to `main` (staging deploy) | All Unit + Policy + §5 probes against the freshly-deployed staging URL |
| Manual `workflow_dispatch` (release) | §5 probes against production URL after `pulumi up` completes |
| Nightly schedule | §5 full suite + `pulumi preview --expect-no-changes` drift check |

### What this means for the totals

No LOC adjustments versus the original §1–§5 plan: every test in the Summary table below stays as specified. The only "extra" cost relative to a Cloud-backed setup is:

- §5.1 harness: **~80 LOC** of ephemeral-stack glue that Review Stacks would have given us for free
- §1.3 crypto tests: **~90 LOC** that ESC would have eliminated
- §1.2 IAM lockdown: **~25 LOC** that OIDC would have eliminated

~195 LOC total is the self-hosted overhead. That's the deliberate cost of not depending on Pulumi Cloud, and the plan budgets for it.

## References

- [Pulumi Testing overview](https://www.pulumi.com/docs/iac/concepts/testing/) — three-tier pyramid (Unit / Property / Integration)
- [Unit Testing guide](https://www.pulumi.com/docs/iac/concepts/testing/unit/) — `setMocks`, async assertions, full TS example
- [Policy as Code (CrossGuard)](https://www.pulumi.com/docs/iac/concepts/policy-as-code/) — backend-independent; runs locally via `--policy-pack`
- [Self-hosted backends](https://www.pulumi.com/docs/iac/concepts/state-and-backends/#using-a-self-managed-backend) — Scaleway/S3 backend semantics and limitations
- [Integration testing with Automation API](https://www.pulumi.com/docs/iac/concepts/testing/integration/automation-api/) — programmatic stack lifecycle, works fully against self-hosted state
- [Pulumi examples repo — testing-unit-ts](https://github.com/pulumi/examples/tree/master/testing-unit-ts) — reference for §0 harness
- [Pulumi examples repo — policy-packs](https://github.com/pulumi/examples/tree/master/policy-packs) — `aws-ts-advanced`, `stackvalidation-ts`, `kubernetes-ts` reference policies
- [Test-Driven Infrastructure with Pulumi and Jest (2022)](https://www.pulumi.com/blog/testing-pulumi-programs-with-jest/) — Jest/Vitest pattern, no Cloud dependency
- [Testing in Practice (2021)](https://www.pulumi.com/blog/testing-in-practice/) — deep dive on Pulumi's testing trophy/pyramid
- OWASP IaC Top 10 — maps onto §1 gaps (open SG, public storage, hardcoded secrets, missing encryption)
