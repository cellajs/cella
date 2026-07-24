import { isMain } from '../lib/utils/is-main'
import { parseServiceRows } from '../lib/utils/service-rows'
import { errorMessage } from '../lib/utils/errors'
import { getFlag } from './args'
import { type RolloutRuntime, runWavedRollout, type WavedRolloutPlan } from './rollout'
import { planForService } from './rollout-plans'
import { createRolloutRuntime } from './rollout-runtime'

interface RolloutItem {
  service: string
  health_url: string
}

function parseRolloutJson(raw: string, flag: string): RolloutItem[] {
  return parseServiceRows(raw, flag, { required: ['service', 'health_url'] })
}

export function parseArgs(argv: string[]): { primary: RolloutItem[]; rest: RolloutItem[]; stack: string; sha: string } {
  const primaryRaw = getFlag(argv, '--primary-json') ?? '[]'
  const restRaw = getFlag(argv, '--rest-json') ?? '[]'
  const stack = getFlag(argv, '--stack')
  const sha = getFlag(argv, '--sha')
  if (!stack || !sha) throw new Error('Usage: deploy-rollout.ts --stack <stack> --sha <git-sha> --primary-json <json> --rest-json <json>')
  return { primary: parseRolloutJson(primaryRaw, '--primary-json'), rest: parseRolloutJson(restRaw, '--rest-json'), stack, sha }
}

/** Build the two-wave plan from the CI rollout matrices. */
export function buildWavedPlan(args: { primary: RolloutItem[]; rest: RolloutItem[]; sha: string }): WavedRolloutPlan {
  if (args.primary.length > 1) throw new Error(`Expected at most one primary rollout service, got ${args.primary.length}`)
  if (args.primary.length === 0) console.info('No primary rollout service configured — skipping wave 1.')
  const [primaryItem] = args.primary
  return {
    sha: args.sha,
    primary: primaryItem ? planForService(primaryItem.service, primaryItem.health_url || undefined) : undefined,
    rest: args.rest.map((item) => planForService(item.service, item.health_url || undefined)),
  }
}

export async function main(argv = process.argv.slice(2), makeRuntime: (opts: { stack: string }) => RolloutRuntime = createRolloutRuntime): Promise<void> {
  const args = parseArgs(argv)
  process.env.APP_MODE ??= args.stack.split('/').pop()
  const { loadEngineConfig } = await import('../config/engine-config')
  await loadEngineConfig()
  if (args.sha === 'latest' || args.sha.endsWith(':latest')) throw new Error(`Refusing to deploy non-pinned image tag '${args.sha}'`)
  const plan = buildWavedPlan(args)
  await runWavedRollout(plan, makeRuntime({ stack: args.stack }))
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(errorMessage(err))
    process.exit(1)
  })
}
