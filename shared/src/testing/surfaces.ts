import { afterEach, beforeEach } from 'vitest';
import { appConfig } from '../config-builder/app-config.ts';
import type { SurfaceArrangement } from '../config-builder/types.ts';

type Surfaces = Record<string, SurfaceArrangement | undefined>;

/** A test file calls this at its top: every test starts with no arranged surface, whatever the app arranges, and the app's arrangements return afterwards. */
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

/** Arranges one surface while `run` executes, and puts back what the slot held before. */
export function withSurface(slot: string, arrangement: SurfaceArrangement, run: () => void) {
  const surfaces = appConfig.surfaces as Surfaces;
  const previous = surfaces[slot];
  surfaces[slot] = arrangement;
  try {
    run();
  } finally {
    if (previous) surfaces[slot] = previous;
    else delete surfaces[slot];
  }
}
