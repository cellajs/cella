import { createApiKey, deleteApiKey } from '../../lib/scaleway/iam-client';
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

/** Lifetime of the key a privileged run mints from a durable Owner API key. */
const MINTED_KEY_TTL_MS = 30 * 60_000;

/** A user key with more life than this is durable: a run mints a short-lived key from it and never drives Pulumi with the durable key itself. */
const DURABLE_KEY_HOURS = 24;

/** The prompt hint for an Owner API key. */
export const OWNER_KEY_HINT = 'console → your user → API keys; any key holding IAMManager also works';

export interface OwnerKey extends KeyPair {
  organizationId: string;
  /** True when this run minted the key from a durable Owner API key and revokes it on release. */
  minted: boolean;
  /** Revoke a minted key; a supplied key is left alone. Safe to call twice. */
  release(): Promise<void>;
}

/**
 * An Owner API key for a run that cannot take the operator key: creating the operator key itself, and a privileged action on a stack that
 * has no operator application yet. It is typed at the prompt, never read from the environment.
 * The bearer is validated first: an organization Owner, or a principal holding IAMManager; an application the engine created is refused by name.
 * A durable user key (no expiry, or more than a day left) never drives Pulumi itself: the run mints a 30-minute key from it and revokes that at
 * the end. A short-lived user key or an application key is used as it is. Every failure names the fix and exits before the stack is touched.
 * A key typed at the prompt is kept in memory for this run of the CLI, so a menu session asks once; every action validates it again.
 */
export async function acquireOwnerKey(opts: {
  names: PrincipalNames & AppPrincipalNames;
  projectId: string;
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
  rememberOwnerKey(pair);
  if (remembered) console.info(pc.dim('Using the Owner API key typed earlier in this session.'));

  const hours = hoursUntilExpiry(desc);
  const durableUserKey = desc.bearer !== 'application' && (hours === undefined || hours > DURABLE_KEY_HOURS);
  if (!durableUserKey) {
    console.info(`${pc.dim('Owner API key:')} ${formatKeyLine(desc, role)}`);
    return { ...pair, organizationId, minted: false, release: async () => {} };
  }

  const expiresAt = new Date(Date.now() + MINTED_KEY_TTL_MS).toISOString();
  const minted = await createApiKey(
    { secretKey: pair.secretKey },
    { userId: desc.bearerId, description: `${opts.slug}-${opts.mode} privileged run (auto-revoked)`, defaultProjectId: projectId, expiresAt },
  );
  console.info(
    `${pc.dim('Owner API key:')} ${formatKeyLine(desc, role)}\n  ${pc.dim('minted')} ${minted.access_key} ${pc.dim(`for this run, expires ${expiresAt.slice(0, 16).replace('T', ' ')} UTC, revoked when the run ends`)}`,
  );
  let released = false;
  return {
    accessKey: minted.access_key,
    secretKey: minted.secret_key,
    organizationId,
    minted: true,
    async release() {
      if (released) return;
      released = true;
      await deleteApiKey({ secretKey: pair.secretKey }, minted.access_key).catch((error) =>
        console.warn(`${warningMark} could not revoke the minted key ${minted.access_key} (${errorMessage(error)}); it expires at ${expiresAt}.`),
      );
      console.info(pc.dim(`Minted key ${minted.access_key} revoked.`));
    },
  };
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
