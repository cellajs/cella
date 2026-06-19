import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

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
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (install(version)) {
      console.info(`scaleway plugin v${version} installed`)
      const res = spawnSync('pulumi', ['plugin', 'ls'], { stdio: 'inherit', env: process.env })
      if (res.status !== 0) process.exit(res.status ?? 1)
      return
    }
    console.warn(`plugin install attempt ${attempt} failed; retrying in 15s`)
    await new Promise((resolve) => setTimeout(resolve, 15_000))
  }
  console.error('::error::Pulumi scaleway provider install failed after 5 attempts')
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()