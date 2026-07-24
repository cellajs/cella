import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { isMain } from '../lib/utils/is-main'
import { retry } from '../lib/utils/retry'

const require = createRequire(import.meta.url)

export function scalewayProviderVersion(): string {
  return require('@pulumiverse/scaleway/package.json').version as string
}

function install(version: string): boolean {
  const res = spawnSync('pulumi', ['plugin', 'install', 'resource', 'scaleway', `v${version}`], { stdio: 'inherit', env: process.env })
  return res.status === 0
}

export async function main(): Promise<void> {
  const version = scalewayProviderVersion()
  try {
    await retry(
      async () => {
        if (!install(version)) throw new Error('plugin install failed')
      },
      { attempts: 5, delayMs: 15_000, onRetry: (attempt) => console.warn(`plugin install attempt ${attempt} failed; retrying in 15s`) },
    )
  } catch {
    throw new Error('Pulumi scaleway provider install failed after 5 attempts')
  }
  console.info(`scaleway plugin v${version} installed`)
  const res = spawnSync('pulumi', ['plugin', 'ls'], { stdio: 'inherit', env: process.env })
  if (res.status !== 0) throw new Error(`pulumi plugin ls failed with exit ${res.status}`)
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`::error::${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
}