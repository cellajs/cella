import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Absolute path to the `infra/` package root, derived from this file's location (`infra/lib/utils/`). */
export const infraDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
