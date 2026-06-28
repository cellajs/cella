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
  // --skip-destroy: don't tear down the old generation inline. The promoted
  // old generation is retained as `previous` (rollback target); powering it off
  // and reaping the previous-previous straggler is deferred to the single
  // reconcile `pulumi up` below. Keeps VM teardown off the deploy's critical path.
  const args = ['--filter', 'infra', 'deploy-service', '--service', item.service, '--sha', opts.sha, '--stack', opts.stack, '--skip-destroy']
  if (item.health_url) args.push('--health-url', item.health_url)
  const res = spawnSync('pnpm', args, { stdio: 'inherit', env: process.env })
  if (res.status !== 0) throw new Error(`deploy-service failed for ${item.service} with exit ${res.status}`)
}

// Final reconcile after every service has cut over and promoted. A single
// whole-stack `pulumi up` converges compute to the post-deploy ledger: it powers
// OFF each retained `previous` generation (now off the LB — pausing its compute
// billing so a deploy doesn't pay twice per service) and destroys any
// previous-previous straggler that aged out of the ledger. Off the per-service
// critical path: runs once, only after all cutovers are healthy.
function reconcileGenerations(stack: string): void {
  const res = spawnSync('pulumi', ['up', '--stack', stack, '--yes', '--non-interactive'], {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: 'inherit',
    env: process.env,
  })
  if (res.status !== 0) throw new Error(`pulumi up (generation reconcile) failed with exit ${res.status}`)
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
  reconcileGenerations(args.stack)
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}