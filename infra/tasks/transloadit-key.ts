import { runtimeSecrets } from '../lib/runtime-secrets';
import type { DeclaredPolicy } from '../lib/scaleway/declared-identities';
import { createApiKey, type IamAuth, listApiKeys, resolveApplicationIdByName, type ScwApiKey } from '../lib/scaleway/iam-client';
import { TRANSLOADIT_PERMISSION_SETS } from '../lib/scaleway/permissions';
import { policyReach, readPolicy } from '../lib/scaleway/policy-reach';
import { appPrincipalNames } from '../lib/scaleway/principals';
import { ensureApplication } from '../lib/scaleway/scaleway-iam';
import type { SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { RUNTIME_FOLDER } from '../lib/scaleway/secret-paths';
import { writeDeclaredPolicies } from './declared-policies';

/** The Secret Manager read the Transloadit plan needs, so a test passes its own. */
export interface TransloaditSecrets {
  getSecretByName(name: string, path: string): Promise<Pick<SecretManagerSecret, 'version_count'> | undefined>;
}

/** What the app's Transloadit application needs for one environment, beside the rules of its policy: itself, or a key. */
export type TransloaditStep = 'create' | 'key' | 'none';

/** The Transloadit application for one environment as an identity update reads it. */
export interface TransloaditPlan {
  step: TransloaditStep;
  /** The policy as declared for the environment; absent while the app has no application, as its creation writes it. */
  policy?: DeclaredPolicy;
}

/** The runtime secret of the Transloadit auth key, by the env var the backend reads; undefined in an app that declares none. */
const authKeySecret = runtimeSecrets.find((secret) => secret.envVar === 'TRANSLOADIT_KEY');

/** The Transloadit application's policy: object writes in `projectIds`, where the upload buckets' policies are the ones that admit it. */
export function transloaditPolicy(opts: { slug: string; projectIds: readonly string[] }): DeclaredPolicy {
  const application = appPrincipalNames(opts.slug).transloadit;
  return {
    name: `${application}-policy`,
    applicationName: application,
    description: 'Object writes on the upload buckets, for the files Transloadit stores (written at Owner moments)',
    rules: [{ permission_set_names: [...TRANSLOADIT_PERMISSION_SETS], project_ids: [...new Set(opts.projectIds)] }],
    tags: [],
  };
}

/** The policy as declared for an environment: the projects it reaches today and `projectId`, so another environment keeps its rule. */
async function declaredTransloaditPolicy(auth: IamAuth, organizationId: string, slug: string, projectId: string): Promise<DeclaredPolicy> {
  const live = await readPolicy(auth, organizationId, `${appPrincipalNames(slug).transloadit}-policy`);
  const reached = live ? policyReach(live.rules, TRANSLOADIT_PERMISSION_SETS).projectIds : [];
  return transloaditPolicy({ slug, projectIds: [...reached, projectId] });
}

/**
 * The app's Transloadit application against IAM, for one environment: `create` when the app has none, `key` when it holds no key. Read
 * with any key that reads IAM and secret metadata.
 * @param opts.slug The app's own slug (`appSlug`): the application is one per app.
 * @returns Undefined where the runtime folder holds no Transloadit auth key: no file of that environment is stored through Transloadit.
 */
export async function planTransloadit(opts: {
  auth: IamAuth;
  secrets: TransloaditSecrets;
  organizationId: string;
  projectId: string;
  slug: string;
}): Promise<TransloaditPlan | undefined> {
  const authKey = authKeySecret && (await opts.secrets.getSecretByName(authKeySecret.secretName, RUNTIME_FOLDER));
  if ((authKey?.version_count ?? 0) === 0) return undefined;
  const applicationId = await resolveApplicationIdByName(opts.auth, opts.organizationId, appPrincipalNames(opts.slug).transloadit);
  if (!applicationId) return { step: 'create' };
  const keys = await listApiKeys(opts.auth, opts.organizationId, applicationId);
  return {
    step: keys.length === 0 ? 'key' : 'none',
    policy: await declaredTransloaditPolicy(opts.auth, opts.organizationId, opts.slug, opts.projectId),
  };
}

/**
 * Make the app's Transloadit application reach an environment, at an Owner moment: the application when the app has none, its policy with
 * the environment's project beside the projects it reaches today, and a key when it holds none. A key that exists is left alone: its
 * replacement is made in the console, and no rotation of the engine touches it.
 * @returns The key just made, which nothing stores, or undefined when the application holds one already.
 */
export async function writeTransloadit(opts: {
  auth: IamAuth;
  organizationId: string;
  projectId: string;
  /** The app's own slug (`appSlug`). */
  slug: string;
  log?: (message: string) => void;
}): Promise<ScwApiKey | undefined> {
  const { auth, organizationId, projectId, slug, log } = opts;
  const application = await ensureApplication(
    { callerSecretKey: auth.secretKey, organizationId, projectId, slug, log },
    { suffix: 'transloadit', description: "Transloadit's key: stores uploaded files in the upload buckets, and reads none" },
  );
  await writeDeclaredPolicies(auth, organizationId, [await declaredTransloaditPolicy(auth, organizationId, slug, projectId)], log);
  if ((await listApiKeys(auth, organizationId, application.id)).length > 0) return undefined;
  return createApiKey(auth, { applicationId: application.id, description: 'Transloadit key', defaultProjectId: projectId });
}
