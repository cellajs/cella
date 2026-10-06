/**
 * Packages the app's service bundles load from disk (a native addon, a driver the tracing SDK patches); see `keepOnDisk`.
 * Imported by every service's `tsup.config.ts`, which no tsconfig covers, so only a build reports a mistake here.
 * @public
 */
export const appKeepOnDisk: readonly string[] = [];
