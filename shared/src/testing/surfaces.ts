import { afterEach, beforeEach } from 'vitest';
import { appConfig } from '../config-builder/app-config.ts';

type Surfaces = Record<string, readonly string[] | undefined>;

/** A test file calls this at its top: every test starts with no listed surface, whatever the app lists, and the app's lists return afterwards. */
export function assumeNoSurfaces() {
  const surfaces = appConfig.surfaces as Surfaces;
  let configured: Surfaces = {};
  beforeEach(() => {
    configured = { ...surfaces };
    for (const slot of Object.keys(surfaces)) delete surfaces[slot];
  });
  afterEach(() => {
    for (const slot of Object.keys(surfaces)) delete surfaces[slot];
    Object.assign(surfaces, configured);
  });
}

/** Lists one surface while `run` executes, in a file that called {@link assumeNoSurfaces}. */
export function withSurface(slot: string, ids: readonly string[], run: () => void) {
  const surfaces = appConfig.surfaces as Surfaces;
  surfaces[slot] = ids;
  try {
    run();
  } finally {
    delete surfaces[slot];
  }
}
