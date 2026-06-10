import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Absolute path to the `infra/` package root. Derived from this file's own
 *  location (both `infra/lib/` and `infra/cli/` are direct children of
 *  `infra/`, so `..` yields the package root in source and compiled output).
 *  A static constant — never varies per invocation, so it is imported directly
 *  rather than threaded through the runtime context. */
export const infraDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
