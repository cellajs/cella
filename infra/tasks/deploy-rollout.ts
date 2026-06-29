import { spawnSync } from 'node:child_process'
import { isMain } from '../lib/is-main'
import { getFlag } from './args'

interface RolloutItem {
  service: string
  health_url: string
}

function parseRolloutJson(raw: string, flag: string): RolloutItem[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error(`${flag} must be a JSON array`)
  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`${flag}[${index}] must be an object`)
    const service = (item as Record<string, unknown>).service
    const healthUrl = (item as Record<string, unknown>).health_url
    if (typeof service !== 'string') throw new Error(`${flag}[${index}].service must be a string`)
    if (typeof healthUrl !== 'string') throw new Error(`${flag}[${index}].health_url must be a string`)
    return { service, health_url: healthUrl }
  })
}

function runDeployService(item: RolloutItem, opts: { stack: string; sha: string }): void {
  // Each deploy-service does its own final `pulumi up` after a healthy cutover,
  // reaping the old generation inline — no `previous` is retained. Rollback is a
  // revert commit + redeploy, which recreates every service (cdc included).
  const args = ['--filter', 'infra', 'deploy-service', '--service', item.service, '--sha', opts.sha, '--stack', opts.stack]
  if (item.health_url) args.push('--health-url', item.health_url)
  const res = spawnSync('pnpm', args, { stdio: 'inherit', env: process.env })
  if (res.status !== 0) throw new Error(`deploy-service failed for ${item.service} with exit ${res.status}`)
}

export function parseArgs(argv: string[]): { primary: RolloutItem[]; rest: RolloutItem[]; stack: string; sha: string } {
  const primaryRaw = getFlag(argv, '--primary-json') ?? '[]'
  const restRaw = getFlag(argv, '--rest-json') ?? '[]'
  const stack = getFlag(argv, '--stack')
  const sha = getFlag(argv, '--sha')
  if (!stack || !sha) throw new Error('Usage: deploy-rollout.ts --stack <stack> --sha <git-sha> --primary-json <json> --rest-json <json>')
  return { primary: parseRolloutJson(primaryRaw, '--primary-json'), rest: parseRolloutJson(restRaw, '--rest-json'), stack, sha }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)
  if (args.primary.length > 1) throw new Error(`Expected at most one primary rollout service, got ${args.primary.length}`)
  if (args.primary.length === 0) console.info('No primary rollout service configured — skipping primary rollout.')
  for (const item of args.primary) runDeployService(item, args)
  for (const item of args.rest) runDeployService(item, args)
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}