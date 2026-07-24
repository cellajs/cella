import pc from 'picocolors'

// Console formatting for the infra CLI and tasks. Vendored (no `shared`
// import) so the engine has zero workspace dependencies at runtime.

export { pc }

/** Green checkmark prefix for success messages */
export const checkMark = pc.bold(pc.greenBright('✔'))

/** Cross mark for error messages */
export const crossMark = pc.bold(pc.redBright('✖'))

/** Warning mark for non-fatal warnings */
export const warningMark = pc.bold(pc.yellowBright('⚠'))

/** Pencil mark for change notifications */
export const changeMark = pc.bold(pc.yellowBright('✎'))

/** Tilde mark for changed/evolved items */
export const tildeMark = pc.bold(pc.yellowBright('~'))

/** Thin line divider for console output (60 chars wide) */
export const DIVIDER = '─'.repeat(60)

/** Prints the shared CLI header with optional version and right-aligned label. */
export function printHeader(name: string, version?: string, right = 'cellajs.com'): void {
  const visibleLeft = version ? `⧈ ${name} · v${version}` : `⧈ ${name}`
  const padding = Math.max(1, 60 - visibleLeft.length - right.length)
  const left = version ? `${pc.cyan(`⧈ ${name}`)}${pc.dim(` · v${version}`)}` : pc.cyan(`⧈ ${name}`)
  console.info()
  console.info(`${left}${' '.repeat(padding)}${pc.cyan(right)}`)
  console.info(DIVIDER)
  console.info()
}

/** Promise-based delay used by poll/retry loops. */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
