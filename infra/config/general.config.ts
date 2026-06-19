import { defineGeneral } from '../lib/general-config'

/**
 * The fork-owned general-config registry — the single place a fork tunes the
 * non-service capacity/feature knobs (DB sizing, WAF, Edge Services, asset
 * retention). Mirrors `services.config.ts` (VM sizing) and
 * `runtime-secrets.config.ts`: data only, while `lib/general-config.ts` owns the
 * types + per-mode resolver and `pulumi-context.ts` binds the values to the
 * Pulumi program.
 *
 * Each field is either a single value for all modes, or a per-mode map
 * (`{ production: …, staging: … }`). Editing a value here is a committed,
 * type-checked change applied on the next deploy — no `pulumi config set`.
 *
 * NOT here: secrets (Secret Manager), the transient DB public-endpoint
 * break-glass toggle (`infra:dbPublicEndpoint`/`dbPublicAcl`), and the bootstrap
 * `computeDeferred` lifecycle marker — those are operator/Pulumi-config concerns,
 * not committed fork data.
 *
 * Caveat: `database.*` is bootstrap-owned (the CI key is read-only on RDB), so a
 * change here still applies via the CLI's "Apply infra change" (a human
 * `pulumi up`), not a routine CI deploy.
 */
export default defineGeneral({
  // VM base image, baked from infra/image/compute-docker.pkr.hcl (Docker, Node 24,
  // /usr/local/bin/cella-boot-agent). This is the stable image NAME: compute.ts
  // resolves the NEWEST Scaleway image with this name at deploy time, so re-baking
  // (`pnpm --filter infra image:build`) is picked up automatically with no UUID
  // paste. Set a literal image UUID instead to pin a specific image for rollback.
  compute: {
    image: 'cella-docker-node-agent-v1',
  },
  database: {
    nodeType: 'DB-DEV-S',
    volumeSizeGb: 10,
  },
  // WAF on in production only; opt in elsewhere by flipping the per-mode value.
  waf: { enabled: { production: true, staging: false } },
  // Edge Services is the legacy S3-website + managed-cert SPA pipeline, superseded
  // by the Caddy reverse-proxy `frontend` VM. Off everywhere; enable as a rollback path.
  edgeServices: { enabled: false },
  // Must outlive any reasonable open browser tab on a previous bundle (a tab may
  // lazy-load a chunk it hasn't fetched yet). Entry files live at the bucket root,
  // outside the `assets/` prefix, so they are never expired by this rule.
  assets: { retentionDays: 14 },
})
