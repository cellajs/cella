import { createApiKey, deleteApiKey } from '../../lib/scaleway/iam-client';
import {
  assertBootstrapCapable,
  describeKey,
  formatKeyLine,
  type KeyPair,
  type OperatorIdentity,
} from '../../lib/scaleway/operator-identity';
import type { PrincipalNames } from '../../lib/scaleway/principals';
import { resolveOrganizationId } from '../../lib/scaleway/scaleway-iam';
import { pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { keyPairOrPrompt } from '../shared';

/** Lifetime of a bootstrap key minted for one run. */
export const MINTED_BOOTSTRAP_TTL_MS = 30 * 60_000;

export interface BootstrapKey extends KeyPair {
  organizationId: string;
  /** True when this run minted the key from the Owner key and will revoke it; false for a key the operator supplied. */
  minted: boolean;
  /** Revoke a minted key; a supplied key is left to the operator. Safe to call twice. */
  release(): Promise<void>;
}

/**
 * The bootstrap key for a privileged run, in order of preference: a key supplied via env or prompt (validated: an Owner, or a principal holding
 * IAMManager; engine principals are refused by name), or a key minted on the spot from the Owner key in `SCW_OWNER_*` with a thirty-minute expiry,
 * revoked when the run ends. Every failure names the fix and exits before the stack is touched.
 */
export async function acquireBootstrapKey(opts: {
  identity: OperatorIdentity;
  names: PrincipalNames;
  projectId: string;
  slug: string;
  mode: string;
}): Promise<BootstrapKey> {
  const { identity, names, projectId } = opts;

  if (!identity.bootstrap && identity.owner) {
    let ownerDesc: Awaited<ReturnType<typeof describeKey>>;
    try {
      ownerDesc = await describeKey(identity.owner);
    } catch (error) {
      console.error(`${warningMark} SCW_OWNER_* cannot describe itself in IAM (${errorMessage(error)}).`);
      process.exit(1);
    }
    if (ownerDesc.bearer !== 'owner') {
      console.error(
        `${warningMark} SCW_OWNER_* is ${formatKeyLine(ownerDesc, ownerDesc.bearer === 'application' ? 'application' : 'member')}, not an organization Owner's Personal API Key.`,
      );
      process.exit(1);
    }
    const organizationId = await resolveOrganizationId(identity.owner.secretKey, projectId);
    const expiresAt = new Date(Date.now() + MINTED_BOOTSTRAP_TTL_MS).toISOString();
    const minted = await createApiKey(
      { secretKey: identity.owner.secretKey },
      {
        userId: ownerDesc.bearerId,
        description: `${opts.slug}-${opts.mode} bootstrap (auto-revoked)`,
        defaultProjectId: projectId,
        expiresAt,
      },
    );
    console.info(
      `${pc.dim('Bootstrap key:')} ${minted.access_key} minted from ${ownerDesc.name} (organization Owner), expires ${expiresAt.slice(0, 16).replace('T', ' ')} UTC, revoked when this run ends`,
    );
    let released = false;
    const ownerSecret = identity.owner.secretKey;
    return {
      accessKey: minted.access_key,
      secretKey: minted.secret_key,
      organizationId,
      minted: true,
      async release() {
        if (released) return;
        released = true;
        await deleteApiKey({ secretKey: ownerSecret }, minted.access_key).catch((error) =>
          console.warn(
            `${warningMark} could not revoke the minted bootstrap key ${minted.access_key} (${errorMessage(error)}); it expires at ${expiresAt}.`,
          ),
        );
        console.info(pc.dim(`Bootstrap key ${minted.access_key} revoked.`));
      },
    };
  }

  const { accessKey, secretKey } = await keyPairOrPrompt(identity.bootstrap, 'bootstrap');
  let organizationId: string;
  try {
    organizationId = await resolveOrganizationId(secretKey, projectId);
  } catch (error) {
    console.error(
      `${warningMark} Could not resolve the organization id (${errorMessage(error)}). Set SCW_ORGANIZATION_ID (backend/.env) or SCW_DEFAULT_ORGANIZATION_ID and re-run.`,
    );
    process.exit(1);
  }
  // A CI or admin key pasted at the bootstrap prompt fails here, in a second and with the reason, not half-way through `pulumi up`.
  try {
    const { desc, role } = await assertBootstrapCapable({ pair: { accessKey, secretKey }, names, organizationId });
    console.info(`${pc.dim('Bootstrap key:')} ${formatKeyLine(desc, role)}`);
  } catch (error) {
    console.error(`${warningMark} ${errorMessage(error)}`);
    process.exit(1);
  }
  return { accessKey, secretKey, organizationId, minted: false, release: async () => {} };
}
