import { defineGeneral } from '../lib/general-config'

export const generalConfig = defineGeneral({
  // VM base image: a Scaleway marketplace LABEL passed straight to the instance
  // (compute.ts). 'docker' is the Docker InstantApp (Docker + compose preinstalled
  // and current), so there is no image bake: the boot agent ships as a registry
  // container pulled at first boot. Set a literal image UUID to pin a
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
