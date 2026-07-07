import { defineGeneral } from '../lib/general-config'

/**
 * The fork-owned general-config registry — the single place a fork tunes the
 * non-service capacity/feature knobs (DB sizing, asset
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
export const generalConfig = defineGeneral({
  // VM base image — a Scaleway marketplace LABEL passed straight to the instance
  // (compute.ts). 'docker' is the Docker InstantApp (Docker + compose preinstalled
  // and current), so there is no image bake: the boot agent ships as a registry
  // container pulled at first boot. Set a literal image UUID instead to pin a
  // specific image for rollback.
  compute: {
    image: 'docker',
  },
  database: {
    nodeType: 'DB-DEV-S',
    volumeSizeGb: 10,
  },
  // Must outlive any reasonable open browser tab on a previous bundle (a tab may
  // lazy-load a chunk it hasn't fetched yet). Entry files live at the bucket root,
  // outside the `assets/` prefix, so they are never expired by this rule.
  assets: { retentionDays: 14 },
});
