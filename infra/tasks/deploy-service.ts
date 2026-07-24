import { isMain } from '../lib/utils/is-main'
import { errorMessage } from '../lib/utils/errors'
import { getFlag } from './args'
import { activateService } from './rollout'
import { planForService } from './rollout-plans'
import { createRolloutRuntime } from './rollout-runtime'

/**
 * Deploy ONE service: record intent, provision its generation via a stack
 * update, health-gate and cut over, promote, and (unless --skip-reap) reap the
 * displaced generation with a second update. deploy-rollout drives the same
 * steps for all services in two waves with a single deferred reap; this
 * entrypoint remains for operator-driven single-service deploys.
 */
export async function deployService(argv = process.argv.slice(2)): Promise<void> {
  const serviceFlag = getFlag(argv, '--service')
  const sha = getFlag(argv, '--sha')
  const stack = getFlag(argv, '--stack')
  const skipReap = argv.includes('--skip-reap')
  if (!serviceFlag || !sha || !stack) throw new Error('Usage: deploy-service.ts --service <svc> --sha <git-sha> --stack <stack> [--health-url URL] [--lb-zone ZONE] [--skip-reap]')
  if (sha === 'latest' || sha.endsWith(':latest')) throw new Error(`Refusing to deploy non-pinned image tag '${sha}'`)

  process.env.APP_MODE ??= stack.split('/').pop()
  const { loadEngineConfig } = await import('../config/engine-config')
  await loadEngineConfig()
  const plan = planForService(serviceFlag, getFlag(argv, '--health-url'))
  const rt = createRolloutRuntime({ stack, lbZone: getFlag(argv, '--lb-zone') })

  // Record the deploy INTENT (pendingSha) and let the Pulumi program, the genId
  // authority, derive the content-addressed id and provision the VM.
  await rt.setPending(plan.service, sha)
  await rt.update([plan.service])

  const generations = await rt.readGenerations()
  const backendIds = plan.strategy !== 'exclusive' || (plan.repointBackendKeys?.length ?? 0) > 0 ? await rt.readLbBackendIds() : {}
  await activateService(plan, sha, generations, backendIds, rt)

  // Reap the displaced generation now that the new one serves healthily. No
  // `previous` is retained; rollback is a revert commit + redeploy. A displaced
  // generation is already detached from the LB, so deferring the reap
  // (--skip-reap) only leaves an idle VM until the caller's single final update.
  if (!skipReap) await rt.update([plan.service])
}

if (isMain(import.meta.url)) {
  deployService().catch((err) => {
    console.error(errorMessage(err))
    process.exit(1)
  })
}
