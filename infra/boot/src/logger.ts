export type LogLevel = 'info' | 'warn' | 'error'

export interface BootLogger {
  log(level: LogLevel, step: string, fields?: Record<string, string | number | boolean>): void
}

export function createJsonLogger(base: Record<string, string>, write: (line: string) => void = console.info): BootLogger {
  return {
    log(level, step, fields = {}) {
      write(JSON.stringify({ level, step, ...base, ...fields }))
    },
  }
}
