import { input } from '@inquirer/prompts'
import pc from 'shared/cli-utils/colors'
import { forceUnlock, lockKey, makeControlClient, stateBucket } from '../../lib/control-store'
import { maskedSecret } from '../prompts/masked-secret'
import { envOr, type InfraContext } from '../shared'

/** Clear a stale stack lock left behind by an interrupted apply or deploy.
 *  The escape hatch for the conditional-write lock guarding mutating ops — use
 *  only when you are sure no other apply/deploy is actually in progress. */
export async function runUnlock(context: InfraContext): Promise<void> {
  const { appConfig } = context
  const targetStack = await input({ message: 'Pulumi stack name', default: `organization/infra/${context.environment}` })

  // Any Scaleway key with write access to the state bucket works.
  const accessKey = await envOr('SCW_ACCESS_KEY', () => input({ message: 'Scaleway access key', validate: (v) => !!v.trim() || '(required)' }))
  const secretKey = await envOr('SCW_SECRET_KEY', () => maskedSecret({ message: 'Scaleway secret key' }))

  const s3 = await makeControlClient(appConfig.s3.region, accessKey, secretKey)
  const removed = await forceUnlock(s3, stateBucket(appConfig.slug), lockKey(targetStack))
  if (removed) {
    console.info(`${pc.green('✓')} Cleared lock held by ${pc.cyan(removed.owner)} (operation: ${removed.operation}, since ${removed.acquiredAt}).`)
  } else {
    console.info(`${pc.dim('No lock present for')} ${targetStack}.`)
  }
}
