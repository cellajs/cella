/**
 * The `external` patterns of a service bundle: everything is inlined except the packages below and
 * `packages`, which the service loads from disk.
 * - @opentelemetry/*: the SDK patches modules through the loader registry, so it loads from disk,
 *   and so does anything it instruments. `pg` is here for that reason: PgInstrumentation only ever
 *   sees a module the registry handed it, so an inlined copy emits no query spans.
 * - pino and its transports: `pino.transport()` starts a worker thread from a file path inside the
 *   pino package, and resolves transport targets like 'pino-pretty' by name from the caller, so
 *   neither survives being inlined.
 * `packages` are plain names: the service's own additions (a native addon, a replication driver) and
 * the app's `appKeepOnDisk` (`backend/src/bundle-config.ts`).
 *
 * A service image installs only the service's `dependencies` (`pnpm install --prod`), so `dependencies` holds packages
 * kept on disk and every inlined package is a devDependency. A `dependencies` entry the bundle would inline throws here.
 * A package kept on disk that production never loads, such as pino-pretty, stays a devDependency.
 */
const sharedPatterns = [
  String.raw`pg(?:\/|$)`,
  String.raw`@opentelemetry\/`,
  String.raw`pino(?:-|\/|$)`,
  String.raw`thread-stream(?:\/|$)`,
  String.raw`sonic-boom(?:\/|$)`,
];

export function keepOnDisk(packages: readonly string[], dependencies: Readonly<Record<string, string>>): { external: RegExp[] } {
  const external = [...sharedPatterns, ...packages.map((name) => `${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?:\\/|$)`)].map(
    (pattern) => new RegExp(`^${pattern}`),
  );

  const inlined = Object.keys(dependencies).filter((name) => !external.some((pattern) => pattern.test(name)));
  if (inlined.length) {
    throw new Error(`The bundle inlines these, so move them to devDependencies (or keep them on disk): ${inlined.join(', ')}`);
  }

  return { external };
}
