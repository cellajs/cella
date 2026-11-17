import { warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { printInventory } from '../../tasks/status';
import { endAction, endsAction, type InfraContext, pointTo } from '../shared';
import { acquireOperatorKey } from './operator-unlock';
import { printLaunchChecklist } from './setup-checklist';
import { copyDeployKeyForMainJob, recordKeyRotation, runOperatorPart } from './setup-operator-part';
import { runOwnerMoment, type SetupMode } from './setup-owner-moment';
import { redeployAfterRotation } from './start-deploy';

/**
 * Set up, resume or rotate a stack. A run that makes or replaces identities (a first setup, a setup that never minted its CI key, a key
 * rotation) starts with an Owner moment: the project and the identities, written with an Owner API key typed at the prompt. Everything else
 * (state, stack, passphrase, the first `pulumi up`, secret values) runs on a one-day operator key, which writes no IAM.
 * A rotation ends after its Owner moment; a resume that only re-syncs needs no Owner key.
 */
export async function runSetup(context: InfraContext, mode: SetupMode): Promise<void> {
  if (mode === 'resume') await printLaunchChecklist(context);
  // The operator key that stores the new deploy key's copy is asked before the Owner moment, which deletes the keys it replaces: no
  // prompt then stands between the delete and the copy.
  const rotationKey = mode === 'rotate-keys' ? await acquireOperatorKey(context) : undefined;
  const writesIdentities = mode === 'rotate-keys' || !context.hasCiKey;
  const moment = writesIdentities ? await runOwnerMoment(context, mode) : undefined;
  if (writesIdentities && !moment) return;
  const operatorKey = rotationKey ?? (await acquireOperatorKey(context));
  // An Owner key never writes the state: the rotation is recorded with the operator key. Its counter makes the deploys it starts (the live
  // release again, then the target) replace every machine, and none keeps the uploads key the rotation deleted. Those deploys run on the
  // main job's copy of the deploy key, which is replaced first: a failed copy ends the rotation before they start on the deleted key.
  if (mode === 'rotate-keys') {
    if (!(await copyDeployKeyForMainJob(context, operatorKey, moment?.projectId ?? context.projectId, moment?.ciKey))) endAction(1);
    await recordKeyRotation(context, operatorKey);
    await redeployAfterRotation(context, operatorKey).catch((error) => {
      if (endsAction(error)) throw error;
      console.warn(`${warningMark} Could not start the deploy (${errorMessage(error)}): ${pointTo('deploy')} does.`);
    });
    // After a compromise the rotation is followed by a look at what an intruder may have left: the inventory, on the observer key and, for
    // the machines, the operator key.
    await printInventory({ ...context, operatorKey }).catch((error) =>
      console.warn(`${warningMark} Could not read the inventory (${errorMessage(error)}): ${pointTo('status')} shows it.`),
    );
  } else await runOperatorPart(context, operatorKey, moment);
}
