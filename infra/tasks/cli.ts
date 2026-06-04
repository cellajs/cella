/** Tiny shared CLI helpers for the tsx deploy tasks (arg parsing + sleep). */

/** Value following `--flag`, or undefined if the flag is absent. */
export function getFlag(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag)
  return idx >= 0 ? argv[idx + 1] : undefined
}

/** Numeric value following `--flag`, or `fallback` when absent/empty. */
export function getNumFlag(argv: string[], flag: string, fallback: number): number {
  const raw = getFlag(argv, flag)
  return raw === undefined ? fallback : Number(raw)
}

/** Promise-based sleep used by the poll loops. */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
