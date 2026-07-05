/**
 * Acquire/release the stack lock from CI (or any shell), so a pipeline deploy
 * and an operator `apply` cannot mutate the same stack concurrently. Uses the
 * same S3 conditional-write lock as the CLI (lib/control-store.ts).
 *
 * Usage:
 *   stack-lock acquire --stack <stack> [--operation deploy] [--ttl-min 60]
 *   stack-lock release --stack <stack>
 *
 * Env: SCW_ACCESS_KEY, SCW_SECRET_KEY (state-bucket access), APP_MODE (config mode).
 * The owner is derived from GITHUB_RUN_NUMBER (CI) or the local user, so the
 * separate acquire/release CI steps — different processes, same run — match.
 */
import { isMain } from '../lib/utils/is-main'
import { acquireLock, controlActor, controlContextForStack, releaseLock } from '../lib/stack/control-store'
import { errorMessage } from '../lib/utils/errors'
import { getFlag, getNumFlag } from './args'

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const command = argv[0]
  const stack = getFlag(argv, '--stack')
  if (!stack || (command !== 'acquire' && command !== 'release')) {
    throw new Error('Usage: stack-lock <acquire|release> --stack <stack> [--operation <op>] [--ttl-min <n>]')
  }
  const ctx = await controlContextForStack(stack)
  if (!ctx) throw new Error('stack-lock: SCW_ACCESS_KEY/SCW_SECRET_KEY (or AWS_*) required')
  const { s3, bucket, lockKey: key } = ctx
  const owner = controlActor()

  if (command === 'release') {
    await releaseLock(s3, bucket, key, owner)
    console.info(`[stack-lock] released ${stack} (${owner})`)
    return
  }

  const operation = getFlag(argv, '--operation') ?? 'deploy'
  const ttlMs = getNumFlag(argv, '--ttl-min', 60) * 60_000
  const res = await acquireLock(s3, bucket, key, { owner, operation, ttlMs })
  if (!res.acquired) {
    console.error(`[stack-lock] ${stack} is locked by ${res.held.owner} (operation: ${res.held.operation}, since ${res.held.acquiredAt}).`)
    console.error('  If that run is dead, clear it with the infra CLI "Unlock" action.')
    process.exit(1)
  }
  console.info(`[stack-lock] acquired ${stack} (${owner}, operation: ${operation})`)
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(errorMessage(err))
    process.exit(1)
  })
}
