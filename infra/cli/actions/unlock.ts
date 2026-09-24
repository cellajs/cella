import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { forceUnlock, lockKey, makeControlClient, peekLock, stateBucket } from '../../lib/stack/control-store';
import { pc } from '../../lib/utils/cli-output';
import { type InfraContext, keyPairOrPrompt, stackNameFor } from '../shared';

/** Clear a stale conditional-write stack lock left by an interrupted apply or deploy. Use only when no other apply or deploy is in progress. */
export async function runUnlock(context: InfraContext): Promise<void> {
  const { appConfig } = context;
  const targetStack = stackNameFor(context);

  // The admin application key, as Apply and the deploy lock with: the state bucket admits only the admin and CI deploy applications, any other key 403s here.
  const { accessKey, secretKey } = await keyPairOrPrompt(
    resolveOperatorIdentity().admin,
    'Scaleway admin application key',
  );

  const s3 = await makeControlClient(appConfig.s3.region, accessKey, secretKey);
  const held = await peekLock(s3, stateBucket(appConfig.slug), lockKey(targetStack));
  if (held) {
    const expired = Date.parse(held.expiresAt) <= Date.now();
    console.info(
      `Lock held by ${pc.cyan(held.owner)} (operation: ${held.operation}, since ${held.acquiredAt}, ${expired ? 'already expired' : `expires ${held.expiresAt}`}).`,
    );
  }
  const removed = await forceUnlock(s3, stateBucket(appConfig.slug), lockKey(targetStack));
  if (removed) {
    console.info(
      `${pc.green('✓')} Cleared lock held by ${pc.cyan(removed.owner)} (operation: ${removed.operation}, since ${removed.acquiredAt}).`,
    );
  } else {
    console.info(`${pc.dim('No lock present for')} ${targetStack}.`);
  }
}
