import { defineGeneral } from '../lib/general-config';

export const generalConfig = defineGeneral({
  // A Scaleway marketplace label or pinned image UUID, passed straight to the instance: the boot runner is pulled at first boot, so nothing is baked.
  compute: {
    image: 'docker',
  },
  database: {
    nodeType: 'DB-DEV-S',
    volumeSizeGb: 10,
  },
  // Must outlive an open browser tab on a previous bundle, which may still lazy-load a chunk. Entry files sit at the bucket root, outside the `assets/` prefix, so this rule never expires them.
  assets: { retentionDays: 14 },
});
