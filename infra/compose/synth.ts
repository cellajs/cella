/**
 * Synth — emit `infra/compose.gen.yml` from the typed Compose model.
 *
 * Usage:
 *   tsx infra/compose/synth.ts            # write infra/compose.gen.yml
 *   tsx infra/compose/synth.ts --check    # exit 1 if the file is out of date
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isMain } from '../lib/is-main'
import { infraDir } from '../lib/paths'
import { composeConfig } from './compose'
import type { ComposeFile } from './types'

const GENERATED_HEADER = [
  '# DO NOT EDIT — generated from infra/compose/ by `pnpm --filter infra compose:synth`.',
  '# Edit services.config.ts (the fork-owned service registry) and re-run synth.',
  '# Deploy machinery and rationale live in infrastructure.ts.',
].join('\n')

/** Keys whose array value is rendered as an inline flow sequence, not a block. */
const FLOW_KEYS = new Set(['profiles', 'test'])
/** Flow-sequence keys whose elements are always single-quoted (e.g. `test`). */
const FLOW_QUOTED_KEYS = new Set(['test'])

/** YAML plain scalars that must be quoted to avoid type coercion or parse errors. */
function needsQuote(v: string): boolean {
  if (v === '') return true
  if (/^\s|\s$/.test(v)) return true // leading/trailing whitespace
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(v)) return true // YAML indicator start
  if (/:\s|\s#/.test(v)) return true // "key: value" or " #comment" ambiguity
  if (/^[+-]?\d/.test(v)) return true // numbers, ports, durations, IPs
  if (/^(y|yes|n|no|true|false|on|off|null|~)$/i.test(v)) return true // bool/null coercion
  return false
}

function scalar(v: string, forceQuote = false): string {
  if (forceQuote || needsQuote(v)) return `'${v.replace(/'/g, "''")}'`
  return v
}

function emitMapping(obj: Record<string, unknown>, indent: number): string[] {
  const pad = '  '.repeat(indent)
  const lines: string[] = []
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) {
      lines.push(`${pad}${key}:`)
    } else if (Array.isArray(val)) {
      if (FLOW_KEYS.has(key)) {
        const quoted = FLOW_QUOTED_KEYS.has(key)
        lines.push(`${pad}${key}: [${val.map((x) => scalar(String(x), quoted)).join(', ')}]`)
      } else {
        lines.push(`${pad}${key}:`)
        for (const item of val) lines.push(`${pad}  - ${scalar(String(item))}`)
      }
    } else if (typeof val === 'object') {
      lines.push(`${pad}${key}:`)
      lines.push(...emitMapping(val as Record<string, unknown>, indent + 1))
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      lines.push(`${pad}${key}: ${val}`)
    } else {
      lines.push(`${pad}${key}: ${scalar(String(val))}`)
    }
  }
  return lines
}

/** Render a ComposeFile to deterministic YAML text. Pure — exported for tests. */
export function renderCompose(file: ComposeFile): string {
  const lines: string[] = ['services:']
  for (const [name, svc] of Object.entries(file.services)) {
    lines.push(`  ${name}:`)
    lines.push(...emitMapping(svc as unknown as Record<string, unknown>, 2))
  }
  return `${GENERATED_HEADER}\n\n${lines.join('\n')}\n`
}

/** The generated deploy artifact — read by resources/compute.ts and shipped to each VM. */
export const OUTPUT_PATH = join(infraDir, 'compose.gen.yml')

function main(): void {
  const yaml = renderCompose(composeConfig)
  if (process.argv.includes('--check')) {
    let current = ''
    try {
      current = readFileSync(OUTPUT_PATH, 'utf-8')
    } catch {
      console.error(`::error::${OUTPUT_PATH} is missing — run \`pnpm --filter infra compose:synth\`.`)
      process.exit(1)
    }
    if (current !== yaml) {
      console.error(`::error::${OUTPUT_PATH} is out of date — run \`pnpm --filter infra compose:synth\` and commit.`)
      process.exit(1)
    }
    console.info('compose.gen.yml is up to date.')
    return
  }
  writeFileSync(OUTPUT_PATH, yaml)
  console.info(`Wrote ${OUTPUT_PATH}`)
}

if (isMain(import.meta.url)) main()
