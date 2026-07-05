import { pathToFileURL } from 'node:url'

/**
 * Whether the current module is the process entry point (run directly rather
 * than imported). Pass `import.meta.url` from the calling module:
 *
 *     if (isMain(import.meta.url)) await main()
 */
export function isMain(importMetaUrl: string): boolean {
  const entry = process.argv[1]
  return entry !== undefined && importMetaUrl === pathToFileURL(entry).href
}
