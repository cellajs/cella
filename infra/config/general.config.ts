import { defineGeneral } from '../lib/general-config'

export const generalConfig = defineGeneral({
// Pass a Scaleway marketplace label or pinned image UUID directly to the instance.
// The Docker image needs no bake because the boot agent is pulled at first boot.
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
