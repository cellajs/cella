import { spawnSync } from 'node:child_process'
import { isMain } from '../lib/utils/is-main'
import { parseServiceRows } from '../lib/utils/service-rows'
import { getFlag } from './args'
import { errorMessage } from '../lib/utils/errors'
import { runPulumi } from '../lib/stack/run-pulumi'

interface RolloutItem {
  service: string
  health_url: string
}

/** Injected effects so rollout sequencing is unit-testable without subprocesses. */
export interface RolloutEffects {
  /** Run one service's deploy (provision, cutover, promote); reap is deferred. */
  deployService: (item: RolloutItem, opts: { stack: string; sha: string }) => void
  /** Single stack update that reaps every displaced generation after all cutovers. */
  reapDisplacedGenerations: (stack: string) => void
}

function parseRolloutJson(raw: string, flag: string): RolloutItem[] {
  return parseServiceRows(raw, flag, { required: ['service', 'health_url'] })
}

function runDeployService(item: RolloutItem, opts: { stack: string; sha: string }): void {
  // Each deploy-service provisions and cuts over its generation but defers the
  // reap (--skip-reap): the displaced generations of ALL services are removed by
  // one final `pulumi up` here. No `previous` is retained. Rollback is a revert
  // commit + redeploy, which recreates every service (cdc included).
  const args = ['--filter', 'infra', 'deploy-service', '--service', item.service, '--sha', opts.sha, '--stack', opts.stack, '--skip-reap']
  if (item.health_url) args.push('--health-url', item.health_url)
  const res = spawnSync('pnpm', args, { stdio: 'inherit', env: process.env })
  if (res.status !== 0) throw new Error(`deploy-service failed for ${item.service} with exit ${res.status}`)
}

function reapViaPulumi(stack: string): void {
  console.info('[rollout] reaping displaced generations (single stack update)')
  runPulumi(['up', '--stack', stack, '--yes', '--non-interactive', '--skip-preview'])
}

const realEffects: RolloutEffects = {
  deployService: runDeployService,
  reapDisplacedGenerations: reapViaPulumi,
}

export function parseArgs(argv: string[]): { primary: RolloutItem[]; rest: RolloutItem[]; stack: string; sha: string } {
  const primaryRaw = getFlag(argv, '--primary-json') ?? '[]'
  const restRaw = getFlag(argv, '--rest-json') ?? '[]'
  const stack = getFlag(argv, '--stack')
  const sha = getFlag(argv, '--sha')
  if (!stack || !sha) throw new Error('Usage: deploy-rollout.ts --stack <stack> --sha <git-sha> --primary-json <json> --rest-json <json>')
  return { primary: parseRolloutJson(primaryRaw, '--primary-json'), rest: parseRolloutJson(restRaw, '--rest-json'), stack, sha }
}

export async function main(argv = process.argv.slice(2), effects: RolloutEffects = realEffects): Promise<void> {
  const args = parseArgs(argv)
  if (args.primary.length > 1) throw new Error(`Expected at most one primary rollout service, got ${args.primary.length}`)
  if (args.primary.length === 0) console.info('No primary rollout service configured — skipping primary rollout.')
  for (const item of args.primary) effects.deployService(item, args)
  for (const item of args.rest) effects.deployService(item, args)
  // All traffic is on the new generations at this point; a reap failure must
  // surface (state drift, idle VM cost) but can never take traffic back.
  effects.reapDisplacedGenerations(args.stack)
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(errorMessage(err))
    process.exit(1)
  })
}
