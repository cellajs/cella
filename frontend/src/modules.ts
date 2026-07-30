/**
 * Frontend module composition root: the eager glob runs every `modules/<name>/<name>-module.ts(x)`
 * file's `defineFrontendModule` call (app-owned included, no import list to maintain), populating
 * placements and module metadata before first render. Lazy-load heavy UI inside renderers.
 */
import.meta.glob('./modules/*/*-module.{ts,tsx}', { eager: true });
