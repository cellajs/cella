import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { escapeRegExp } from './escape-regexp'

export type EnvFileUndeliverableReason = 'empty' | 'multiline'

/** Discriminated union so a failed check always carries its reason. */
export type EnvFileDeliverability = { ok: true } | { ok: false; reason: EnvFileUndeliverableReason }

/** Whether `value` can be written as a single `KEY=value` line in an env file. */
export function isEnvFileDeliverable(value: string): EnvFileDeliverability {
  if (value === '') return { ok: false, reason: 'empty' }
  if (value.includes('\n') || value.includes('\r')) return { ok: false, reason: 'multiline' }
  return { ok: true }
}

/** Set or replace a `KEY=value` line in a dotenv file, creating the file if absent. */
export function writeEnvVar(path: string, key: string, value: string): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const line = `${key}=${value}`
  const re = new RegExp(`^${escapeRegExp(key)}=.*$`, 'm')
  const next = re.test(existing) ? existing.replace(re, line) : `${existing}${existing.endsWith('\n') || existing === '' ? '' : '\n'}${line}\n`
  writeFileSync(path, next)
}
