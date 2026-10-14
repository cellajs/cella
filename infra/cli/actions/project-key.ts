import { createApiKey, deleteApiKey, getApiKey } from '../../lib/scaleway/iam-client';
import type { KeyPair } from '../../lib/scaleway/operator-identity';

/** A key whose preferred project is the environment's. */
export interface ProjectKey extends KeyPair {
  /** True when the wizard minted the key for this run. */
  minted: boolean;
  /** Delete a minted key; a pasted key that already fits is left alone. Safe to call twice. */
  release(): Promise<void>;
}

/** What `keyForProject` calls; a test passes its own. */
export interface ProjectKeyIam {
  getApiKey: typeof getApiKey;
  createApiKey: typeof createApiKey;
  deleteApiKey: typeof deleteApiKey;
}

/** A setup run can include the first `pulumi up`, so the minted key lives as long as a setup's own key. */
const PROJECT_KEY_TTL_MS = 3 * 60 * 60_000;
const ACCEPT_POLL_MS = 2000;
const ACCEPT_LIMIT_MS = 60_000;

/**
 * Give the setup a key whose preferred project is this environment's. Scaleway Object Storage places a bucket in the preferred project of the key
 * that creates it, whatever IAM grants the key holds, and a pasted key has one preferred project. With a project per environment the key that set up
 * one environment points at another's, so the wizard mints a key of the same bearer for this project and deletes it on every way out.
 */
export async function keyForProject(
  pasted: KeyPair,
  projectId: string,
  iam: ProjectKeyIam = { getApiKey, createApiKey, deleteApiKey },
  clock: { now(): number; sleep(ms: number): Promise<void> } = { now: Date.now, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) },
): Promise<ProjectKey> {
  const auth = { secretKey: pasted.secretKey };
  const record = await iam.getApiKey(auth, pasted.accessKey);
  if (record.default_project_id === projectId) return { ...pasted, minted: false, release: async () => {} };

  const bearer = record.user_id ? { userId: record.user_id } : record.application_id ? { applicationId: record.application_id } : undefined;
  if (!bearer) throw new Error(`API key ${pasted.accessKey} names no bearer, so no key of the same bearer can be minted for project ${projectId}.`);
  const minted = await iam.createApiKey(auth, {
    ...bearer,
    description: `Setup of project ${projectId}: minted by the infra CLI for one run`,
    defaultProjectId: projectId,
    expiresAt: new Date(clock.now() + PROJECT_KEY_TTL_MS).toISOString(),
  });
  // The minted key deletes itself, so the release holds after the pasted key is revoked; the pasted key deletes it when the minted one is refused.
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await iam.deleteApiKey({ secretKey: minted.secret_key }, minted.access_key).catch(() => iam.deleteApiKey(auth, minted.access_key));
  };

  // A new key is not accepted everywhere at once: wait until it can describe itself, so the first step that uses it does not fail on timing.
  const startedAt = clock.now();
  for (;;) {
    try {
      await iam.getApiKey({ secretKey: minted.secret_key }, minted.access_key);
      break;
    } catch (error) {
      if (clock.now() - startedAt >= ACCEPT_LIMIT_MS) {
        await release().catch(() => {});
        throw error;
      }
      await clock.sleep(ACCEPT_POLL_MS);
    }
  }
  return { accessKey: minted.access_key, secretKey: minted.secret_key, minted: true, release };
}
