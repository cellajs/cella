import { createApiKey, deleteApiKey } from '../../lib/scaleway/iam-client';
import {
  assertIamManager,
  formatKeyLine,
  hoursUntilExpiry,
  type KeyDescription,
  type KeyPair,
  type OperatorIdentity,
  type PrincipalRole,
} from '../../lib/scaleway/operator-identity';
import type { PrincipalNames } from '../../lib/scaleway/principals';
import { resolveOrganizationId } from '../../lib/scaleway/scaleway-iam';
import { pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { keyPairOrPrompt } from '../shared';

/** Lifetime of the key a privileged run mints from a durable Owner API key. */
export const MINTED_KEY_TTL_MS = 30 * 60_000;

/** A user key with more life than this is durable: a run mints a short-lived key from it and never drives Pulumi with the durable key itself. */
export const DURABLE_KEY_HOURS = 24;

/** The prompt hint for an Owner API key. */
export const OWNER_KEY_HINT = 'console → your user → API keys; any key holding IAMManager also works';

export interface OwnerKey extends KeyPair {
  organizationId: string;
  /** True when this run minted the key from a durable Owner API key and revokes it on release. */
  minted: boolean;
  /** True when the Owner API key was typed at the prompt: the operator holds a key the CLI did not mint and cannot revoke for them. */
  pasted: boolean;
  /** Revoke a minted key; a supplied key is left alone. Safe to call twice. */
  release(): Promise<void>;
}

/**
 * The key for a privileged run: the Owner API key from `SCW_OWNER_*` (on an operator machine a `keychain:`/`op:` reference), else a prompt.
 * The bearer is validated first: an organization Owner, or a principal holding IAMManager; an application the engine created is refused by name.
 * A durable user key (no expiry, or more than a day left) never drives Pulumi itself: the run mints a 30-minute key from it and revokes that at
 * the end. A short-lived user key or an application key is used as it is. Every failure names the fix and exits before the stack is touched.
 */
export async function acquireOwnerKey(opts: {
  identity: OperatorIdentity;
  names: PrincipalNames;
  projectId: string;
  slug: string;
  mode: string;
}): Promise<OwnerKey> {
  const { identity, names, projectId } = opts;
  const pasted = !identity.owner;
  const pair = await keyPairOrPrompt(identity.owner, 'Scaleway Owner API key', OWNER_KEY_HINT);

  let organizationId: string;
  try {
    organizationId = await resolveOrganizationId(pair.secretKey, projectId);
  } catch (error) {
    console.error(
      `${warningMark} Could not resolve the organization id (${errorMessage(error)}). Set SCW_ORGANIZATION_ID (backend/.env) or SCW_DEFAULT_ORGANIZATION_ID and re-run.`,
    );
    process.exit(1);
  }
  let desc: KeyDescription;
  let role: PrincipalRole;
  try {
    ({ desc, role } = await assertIamManager({ pair, names, organizationId }));
  } catch (error) {
    console.error(`${warningMark} ${errorMessage(error)}`);
    process.exit(1);
  }

  const hours = hoursUntilExpiry(desc);
  const durableUserKey = desc.bearer !== 'application' && (hours === undefined || hours > DURABLE_KEY_HOURS);
  if (!durableUserKey) {
    console.info(`${pc.dim('Owner API key:')} ${formatKeyLine(desc, role)}`);
    return { ...pair, organizationId, minted: false, pasted, release: async () => {} };
  }

  const expiresAt = new Date(Date.now() + MINTED_KEY_TTL_MS).toISOString();
  const minted = await createApiKey(
    { secretKey: pair.secretKey },
    {
      userId: desc.bearerId,
      description: `${opts.slug}-${opts.mode} privileged run (auto-revoked)`,
      defaultProjectId: projectId,
      expiresAt,
    },
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
    pasted,
    async release() {
      if (released) return;
      released = true;
      await deleteApiKey({ secretKey: pair.secretKey }, minted.access_key).catch((error) =>
        console.warn(
          `${warningMark} could not revoke the minted key ${minted.access_key} (${errorMessage(error)}); it expires at ${expiresAt}.`,
        ),
      );
      console.info(pc.dim(`Minted key ${minted.access_key} revoked.`));
    },
  };
}

/** Reminder after a run whose Owner API key was typed at the prompt: the CLI cannot revoke a key it did not mint. */
export function printRevokeReminder(): void {
  console.info(
    `\n${pc.dim('Reminder:')} the Owner API key you pasted stays valid; revoke it in the console (IAM → API keys) if it was created for this run.`,
  );
}
