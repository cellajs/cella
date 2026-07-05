/** Tiny CLI arg helpers shared by the tsx tasks and the boot agent. */

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
