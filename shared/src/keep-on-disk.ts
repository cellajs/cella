/**
 * tsup `noExternal` and `external` for a service bundle: everything is inlined except the packages
 * below and `packages`, which the service loads from disk.
 * - @opentelemetry/*: the SDK patches modules through the loader registry, so it loads from disk,
 *   and so does anything it instruments. `pg` is here for that reason: PgInstrumentation only ever
 *   sees a module the registry handed it, so an inlined copy emits no query spans.
 * - jsdom: resolves its default stylesheet through __dirname, so inlining it points that lookup at the
 *   bundle. @blocknote/server-util, which reaches it, is inlined; only its jsdom import stays external.
 * - pino and its transports: `pino.transport()` starts a worker thread from a file path inside the
 *   pino package, and resolves transport targets like 'pino-pretty' by name from the caller, so
 *   neither survives being inlined.
 * `packages` are plain names: the service's own additions (a native addon, a replication driver) and
 * the app's `appKeepOnDisk` (`backend/src/bundle-config.ts`).
 */
const sharedPatterns = [String.raw`pg(?:\/|$)`, String.raw`@opentelemetry\/`, String.raw`pino(?:-|\/|$)`];

export function keepOnDisk(packages: readonly string[]): { noExternal: RegExp[]; external: RegExp[] } {
  const patterns = [
    ...sharedPatterns,
    ...['thread-stream', 'sonic-boom', 'jsdom', ...packages].map((name) => `${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?:\\/|$)`),
  ];
  return {
    // tsup's `noExternal` takes precedence over `external`, so the exceptions live in this negative
    // lookahead; `external` repeats them so subpath imports stay external too.
    noExternal: [new RegExp(`^(?!(?:${patterns.join('|')}))`)],
    external: patterns.map((pattern) => new RegExp(`^${pattern}`)),
  };
}
