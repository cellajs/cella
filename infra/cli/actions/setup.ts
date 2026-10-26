import { rememberOperatorKey } from '../session';
import type { InfraContext } from '../shared';
import { acquireOperatorKey } from './operator-unlock';
import { copyDeployKeyForMainJob, recordKeyRotation, runOperatorPart } from './setup-operator-part';
import { runOwnerMoment, type SetupMode } from './setup-owner-moment';

/**
 * Set up, resume or rotate a stack. A run that makes or replaces identities (a first setup, a setup that never minted its CI key, a key
 * rotation) starts with an Owner moment: the project and the identities, written with an Owner API key typed at the prompt. Everything else
 * (state, stack, passphrase, the first `pulumi up`, secret values) runs on the operator key, which writes no IAM. A rotation ends after its
 * Owner moment; a resume that only re-syncs needs no Owner key.
 */
export async function runSetup(context: InfraContext, mode: SetupMode): Promise<void> {
  const writesIdentities = mode === 'rotate-keys' || !context.hasCiKey;
  const moment = writesIdentities ? await runOwnerMoment(context, mode) : undefined;
  if (writesIdentities && !moment) return;
  // An operator the moment just created is in memory: the session asks for nothing.
  if (moment?.operatorKey) rememberOperatorKey(moment.operatorKey);
  const operatorKey = await acquireOperatorKey(context);
  // An Owner key never writes the state: the rotation is recorded with the operator key, and its counter makes the next deploy replace
  // every machine, so none keeps a key the rotation deleted. The main job's copy of the deploy key is replaced first, for the same reason.
  if (mode === 'rotate-keys') {
    await copyDeployKeyForMainJob(context, operatorKey, moment?.projectId ?? context.projectId, moment?.ciKey);
    await recordKeyRotation(context, operatorKey);
  } else await runOperatorPart(context, operatorKey, moment);
}
