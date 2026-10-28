import {
  assertIamManager,
  formatKeyLine,
  hoursUntilExpiry,
  type KeyDescription,
  type KeyPair,
  organizationIdOfKey,
  type PrincipalRole,
} from '../../lib/scaleway/operator-identity';
import type { AppPrincipalNames, PrincipalNames } from '../../lib/scaleway/principals';
import { pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { forgetOwnerKey, rememberedOwnerKey, rememberOwnerKey } from '../session';
import { endAction, keyPairOrPrompt } from '../shared';

/** A key with more life than this is durable: it writes IAM from every address until it ends, so an Owner moment refuses it (C1). */
const DURABLE_KEY_HOURS = 24;

/** The prompt hint for an Owner API key. */
const OWNER_KEY_HINT = 'console → your user → API keys, with an expiry of hours; any key holding IAMManager also works';

export interface OwnerKey extends KeyPair {
  organizationId: string;
  /** Let go of the key at the end of the action; the key itself stays valid until it is revoked or ends. Safe to call twice. */
  release(): Promise<void>;
}

/**
 * An Owner API key for every action that writes IAM: an Owner moment of a setup or a rotation, the operator key, the runner, identities. It is
 * typed at the prompt, never read from the environment.
 * The bearer is validated first: an organization Owner, or a principal holding IAMManager; an application the engine created is refused by name.
 * The key is used as it is: an Owner moment runs no Pulumi and no child process. A durable key (no expiry, or more than a day left) is refused,
 * as it would write IAM from every address between Owner moments. Every failure names the fix and exits before the stack is touched.
 * A key typed at the prompt is kept in memory for this run of the CLI, so a menu session asks once; every action validates it again.
 * `projectId` is the environment's, when it has one yet: a first setup picks the project with the key.
 */
export async function acquireOwnerKey(opts: {
  names: PrincipalNames & AppPrincipalNames;
  projectId?: string;
  slug: string;
  mode: string;
}): Promise<OwnerKey> {
  const { names, projectId } = opts;
  // A key typed earlier in this run is used again, and validated again below: it may have been revoked since.
  const remembered = rememberedOwnerKey();
  const pair = remembered ?? (await keyPairOrPrompt(undefined, 'Scaleway Owner API key', OWNER_KEY_HINT));

  let organizationId: string;
  try {
    organizationId = await organizationIdOfKey(pair, projectId);
  } catch (error) {
    forgetOwnerKey();
    console.error(
      `${warningMark} Could not resolve the organization id (${errorMessage(error)}). Set SCW_ORGANIZATION_ID (backend/.env) or SCW_DEFAULT_ORGANIZATION_ID and re-run.`,
    );
    endAction(1);
  }
  let desc: KeyDescription;
  let role: PrincipalRole;
  try {
    ({ desc, role } = await assertIamManager({ pair, names, organizationId }));
  } catch (error) {
    forgetOwnerKey();
    console.error(`${warningMark} ${errorMessage(error)}`);
    endAction(1);
  }
  const hours = hoursUntilExpiry(desc);
  console.info(`${pc.dim('Owner API key:')} ${formatKeyLine(desc, role)}`);
  if (hours === undefined || hours > DURABLE_KEY_HOURS) {
    forgetOwnerKey();
    console.error(
      `${warningMark} This key would write IAM from every address ${hours === undefined ? 'until it is revoked' : `for ${Math.round(hours / 24)} more day(s)`}, so an Owner moment refuses it. Make one that expires within hours (console → your user → API keys → Generate API key, with an expiration), and revoke it after.`,
    );
    endAction(1);
  }
  rememberOwnerKey(pair);
  if (remembered) console.info(pc.dim('Using the Owner API key typed earlier in this session.'));
  return { ...pair, organizationId, release: async () => {} };
}

let revokeReminderShown = false;

/**
 * Reminder after an action whose Owner API key was typed at the prompt: the CLI cannot revoke a key it did not mint. Printed once per run of
 * the CLI, as the key stays in memory for the actions that follow.
 */
export function printRevokeReminder(): void {
  if (revokeReminderShown) return;
  revokeReminderShown = true;
  console.info(
    `\n${pc.dim('Reminder:')} the Owner API key you pasted stays valid, and this session keeps it in memory until you quit. Revoke it in the console (IAM → API keys) when you are done, if it was created for this.`,
  );
}
