import { defineGeneral } from '../lib/general-config';

export const generalConfig = defineGeneral({
  // A Scaleway marketplace label or pinned image UUID, passed straight to the instance: the agent is loaded at first boot, so nothing is baked.
  compute: { image: 'docker' },
  database: { nodeType: 'DB-DEV-S', volumeSizeGb: 10 },
  // Must outlive an open browser tab on a previous bundle, which may still lazy-load a chunk. Entry files sit at the bucket root, outside the `assets/` prefix, so this rule never expires them.
  assets: { retentionDays: 14 },
  // A release waits at most this many minutes for its deploy. At the main job's 2 vCPU and 4 GB, Scaleway bills a scheduled run of about
  // ten seconds at roughly 0.0003 euro: every minute is about nine euro a month after the free tier, every five minutes stays within it.
  schedule: { everyMinutes: { production: 1, staging: 5 } },
});
