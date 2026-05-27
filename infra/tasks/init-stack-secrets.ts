/**
 * Idempotently populate Pulumi stack config. Safe to re-run.
 * Usage: tsx infra/tasks/init-stack-secrets.ts [stackName]
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { changeMark, checkMark, tildeMark } from 'shared/console'

const cwd = new URL('..', import.meta.url).pathname

function pulumi(args: string[], stackArg: string | undefined): string {
  const stackFlag = stackArg ? ['--stack', stackArg] : []
  const result = spawnSync('pulumi', [...args, ...stackFlag], {
    cwd,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) throw new Error(result.stderr || `pulumi ${args.join(' ')} failed`)
  return result.stdout.trim()
}

function hasConfig(key: string, stackArg: string | undefined): boolean {
  try {
    return pulumi(['config', 'get', key], stackArg).length > 0
  } catch {
    return false
  }
}

function setConfig(key: string, value: string, secret: boolean, stackArg: string | undefined): void {
  const args = ['config', 'set']
  if (secret) args.push('--secret')
  args.push(key, value)
  if (stackArg) args.push('--stack', stackArg)
  const result = spawnSync('pulumi', args, { cwd, shell: false, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`pulumi config set ${key} failed`)
}

/** Cryptographically random base64url string (URL/shell/YAML safe — no `+/=`). */
const randomSecret = (bytes = 32) => randomBytes(bytes).toString('base64url')

export type Spec =
  | { key: string; label: string; from: 'random'; bytes?: number }
  | { key: string; label: string; from: 'env'; envName: string; secret?: boolean }

/** Declarative table of stack values to populate. Order is log order only. */
export const specs: Spec[] = [
  { key: 'infra:dbPassword',        label: 'database password',  from: 'random', bytes: 24 },
  { key: 'infra:cookieSecret',      label: 'cookie secret',      from: 'random' },
  { key: 'infra:unsubscribeSecret', label: 'unsubscribe secret', from: 'random' },
  { key: 'infra:cdcSecret',         label: 'CDC secret',         from: 'random' },
  { key: 'infra:yjsSecret',         label: 'Yjs secret',         from: 'random' },
  { key: 'infra:piiHashSecret',     label: 'PII hash secret',    from: 'random' },
  { key: 'infra:adminEmail',        label: 'admin email',        from: 'env', envName: 'ADMIN_EMAIL' },
  { key: 'infra:brevoApiKey',       label: 'Brevo API key',      from: 'env', envName: 'BREVO_API_KEY' },
  { key: 'infra:scwAiApiKey',       label: 'Scaleway AI API key',from: 'env', envName: 'SCW_AI_API_KEY' },
  { key: 'scaleway:projectId',      label: 'Scaleway project ID',from: 'env', envName: 'SCW_PROJECT_ID', secret: false },
]

export function main(stackArg = process.argv[2] ?? process.env.STACK): void {
  if (specs.every((spec) => hasConfig(spec.key, stackArg))) {
    console.info(`${checkMark} all ${specs.length} stack secrets already set`)
    return
  }
  for (const spec of specs) {
    if (hasConfig(spec.key, stackArg)) {
      console.info(`${checkMark} ${spec.label} (${spec.key}) already set`)
      continue
    }
    if (spec.from === 'random') {
      setConfig(spec.key, randomSecret(spec.bytes), true, stackArg)
      console.info(`${changeMark} generated ${spec.label} (${spec.key})`)
    } else {
      const value = process.env[spec.envName]
      if (!value) {
        console.warn(`${tildeMark} skipped ${spec.label} (${spec.key}) — set ${spec.envName} env var to populate`)
        continue
      }
      setConfig(spec.key, value, spec.secret ?? true, stackArg)
      console.info(`${changeMark} ${spec.label} (${spec.key}) from $${spec.envName}`)
    }
  }
  console.info('Stack secrets initialized.')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
