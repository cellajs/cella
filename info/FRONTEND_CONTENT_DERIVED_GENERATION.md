# Frontend content-derived generation

Status: **Plan only — not yet implemented.**

## Problem

The frontend Caddy VM is a stateless reverse-proxy to the SPA's S3 bucket. It holds no
assets and no cache — the only things baked into it are the Caddyfile, the security
headers, the CSP, `ORIGIN_HOST`, and `RELEASE_SHA` (surfaced as `X-App-Version`).

Yet it is recreated (full create → LB cutover → destroy-old) on **every** deploy, for
two reasons that have nothing to do with the frontend actually changing:

- Its container image is tagged with the release SHA and built with
  `RELEASE_SHA=<sha>` (`.github/workflows/deploy.yml`), so the image digest changes
  every deploy.
- The rollout passes `--gen $RUN_NUMBER` unconditionally (`.github/workflows/deploy.yml`).

Because the VM is created with `ignoreChanges: ['cloudInit', 'image']`
(`infra/resources/compute.ts`), the *only* thing that ever rolls it is a generation
(resource-name) bump. So Caddyfile/CSP changes — the few inputs that genuinely change
over time — are never "listened to" on their own; they ride along incidentally with the
app SHA roll. A CSP-only edit does not go live until some unrelated release happens to
roll a new generation.

## Goal

Make the frontend roll a new generation **only when its own content changes**
(Caddyfile, CSP, `ORIGIN_HOST`), while keeping the rollout *code* identical for every
service. The difference between services must be **data fed into a fingerprint**, not an
`if (service === 'frontend')` branch in the rollout primitive.

## Core idea

Replace the unconditional CI integer (`--gen $RUN_NUMBER`) with a per-service **content
fingerprint** that gates whether a generation rolls at all:

```
fingerprint(svc) = hash(imageTag ∥ cloud-init env values [CSP, ORIGIN_HOST, manifest])
roll svc  ⇔  fingerprint(svc) ≠ last recorded fingerprint
```

- **backend / cdc** — their image tag is the app digest, which changes every deploy →
  fingerprint always changes → they always roll. **Behavior unchanged.**
- **frontend** — once its proxy image is tagged by *its own* content (not the app SHA),
  the fingerprint changes only when the Caddyfile / CSP / origin change → it rolls only
  then. A pure bundle deploy becomes **S3-sync-only, with zero VM churn.**

The skip path is purely data-driven, so backend/cdc never even reach it. No service-name
special-casing in the rollout primitive — that is what keeps the frontend from becoming a
big exception.

## Changes by area

### 1. Stack config — one new key per service

Add `fp_<slug>` alongside the existing `gen_<slug>` / `sha_<slug>` / `pending*` keys
(`infra/tasks/deploy-service.ts`). It records the last-deployed fingerprint.

### 2. A single pure fingerprint function in `infra/lib/`

`generationFingerprint(svc, { imageTag, env })`, computed from the **canonical sources**
(`infra/lib/frontend-csp.ts`, the `envPool` in `infra/resources/compute.ts`) so it can
never drift from what is actually baked. Computed from config at deploy time — no Pulumi
round-trip, so there is no circular "roll in order to learn whether to roll" dependency.

### 3. Gate in `infra/tasks/deploy-service.ts`

At the top of `deployService`: compute `newFp`. If `newFp === fp_<slug>` **and** the live
generation is healthy → return early (no `pendingGen`, no cutover, no VM-creating
`pulumi up`). Otherwise run the existing `pending → cutover → promote` flow and persist
`fp_<slug> = newFp`. The same code runs for all services; backend/cdc simply never match
the skip condition.

### 4. Content-tag the frontend proxy image (the only build-layer change)

Tag it `caddy-<hash(Caddyfile + Dockerfile + base image ref)>` instead of the release
SHA; CI skips build/push if that tag already exists in the registry
(`.github/workflows/deploy.yml`). Stop passing `RELEASE_SHA=<app sha>` into it. Identical
Caddyfile → identical tag → no rebuild → unchanged fingerprint. This is a small, justified
build difference, not a rollout exception.

### 5. Relocate the version gate (the one genuinely frontend-specific consequence)

Today the rollout asserts `X-App-Version == release SHA` off the proxy header
(`infra/tasks/deploy-service.ts`, `.github/workflows/deploy.yml`). Once the proxy stops
re-baking per release, that header reflects the *proxy's own* build, so move the "is the
new app release live?" check to the **content layer**: after `publish-frontend` flips
`index.html`, fetch the live `index.html` / a `/version.json` from S3 and assert it
reports the new release SHA. Bonus: this closes a real gap today, where the proxy header
can be green while S3 still serves an old `index.html`.

## Phasing

Each phase is independently revertable; the skip is the only behavior change and it lands
last.

1. **Fingerprint plumbing (no behavior change)** — add `generationFingerprint`, write
   `fp_<slug>` on every deploy, but still always roll. Verify in logs that fingerprints
   are stable across no-op deploys.
2. **Content-tag the proxy image + drop the `RELEASE_SHA` bake** — frontend image stops
   changing per release.
3. **Relocate the version gate to S3 content** — keep both checks transiently, then drop
   the proxy-header assertion for the frontend.
4. **Flip on the skip** — enable the `newFp === fp` early-return. Now the frontend rolls
   only on real change.

## Tests

- Unit: `generationFingerprint` — stable for identical inputs; changes on Caddyfile / CSP
  / origin edits; **unchanged** when only the app SHA differs (the whole point).
- Unit: deploy-service gate — skip when fp matches and healthy; roll when fp differs;
  backend/cdc always roll.
- Update `infra/tests/unit/caddyfile.test.ts` and any `X-App-Version` expectations for the
  relocated gate.

## Risks and mitigations

- **First deploy** — no `fp_<slug>` recorded → treated as changed → rolls once. Fine.
- **Rollback** — an app rollback rolls backend; a frontend bundle rollback stays an S3
  re-sync (unchanged).
- **Tag determinism** — hash our *own* build-context bytes; do not rely on buildx digest
  reproducibility.
- **Stale fingerprint vs reality** — always derive from the canonical CSP/env modules,
  never a hand-maintained copy.

## Out of scope (natural follow-up)

Content-tagging **all** images so backend/cdc also skip no-op rolls — strictly more
consistent, but larger; track separately.
