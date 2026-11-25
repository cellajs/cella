import { defineGeneral } from '@cellajs/cli/infra';

export const generalConfig = defineGeneral({
  // A Scaleway marketplace label or pinned image UUID, passed straight to the instance: the agent is loaded at first boot, so nothing is baked.
  compute: { image: 'docker' },
  database: { nodeType: 'DB-DEV-S', volumeSizeGb: 10 },
  // Days a release's hashed files stay once another release replaced it, as an open tab of it may still lazy-load a chunk.
  assets: { retentionDays: 14 },
  // A release waits at most this many minutes for its deploy. At the main job's 2 vCPU and 4 GB, Scaleway bills a scheduled run of about
  // ten seconds at roughly 0.0003 euro: every minute is about nine euro a month after the free tier, every five minutes stays within it.
  schedule: { everyMinutes: { production: 1, staging: 5 } },
});
