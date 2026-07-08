import { spawnSync } from 'node:child_process'
import { isMain } from '../lib/utils/is-main'
import { parseServiceRows } from '../lib/utils/service-rows'
import { getFlag } from './args'
import { errorMessage } from '../lib/utils/errors'

interface RolloutItem {
  service: string
  health_url: string
}

function parseRolloutJson(raw: string, flag: string): RolloutItem[] {
  return parseServiceRows(raw, flag, { required: ['service', 'health_url'] })
}

function runDeployService(item: RolloutItem, opts: { stack: string; sha: string }): void {
  // Each deploy-service does its own final `pulumi up` after a healthy cutover,
  // reaping the displaced generation inline; no `previous` is retained. Rollback is a
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
    console.error(errorMessage(err))
    process.exit(1)
  })
}
