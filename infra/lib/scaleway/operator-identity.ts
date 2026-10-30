import { OBSERVER_KEY_NAMES } from '../utils/env-files';
import type { FetchLike } from '../utils/fetch-like';
import { resolveFetch } from '../utils/fetch-like';
import { getApiKey, IAM_BASE, type IamAuth, listOrganizationPolicies, resolveOrganizationIdViaProject } from './iam-client';
import type { AppPrincipalNames, PrincipalNames } from './principals';
import { resolveOrganizationIdFromEnv } from './provider-env';
import { scwFetch } from './scw-fetch';

export interface KeyPair {
  accessKey: string;
  secretKey: string;
}

/** All-or-nothing env pair: a half-set pair is a configuration error, never a fallback (an access key from one pair with the secret of another produced unexplainable 403s). */
export function envKeyPair(env: NodeJS.ProcessEnv, accessVar: string, secretVar: string): KeyPair | undefined {
  const accessKey = env[accessVar]?.trim() || undefined;
  const secretKey = env[secretVar]?.trim() || undefined;
  if (!!accessKey !== !!secretKey) throw new Error(`${accessVar} and ${secretVar} must be set together`);
  return accessKey && secretKey ? { accessKey, secretKey } : undefined;
}

/**
 * Every API key an operator process may hold, resolved in one place so the CLI actions cannot drift apart in which env pair they read.
 * - `observer`: `SCW_OBSERVER_ACCESS_KEY` / `SCW_OBSERVER_SECRET_KEY` from infra/.env.<mode>, the observer application's key: read-only.
 * - `ambient`: `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` as the process found them (a CI runner, a shell export): shown in diagnostics, never written to the env file.
 * A privileged key is not among them: the operator key and an Owner API key are typed at the prompt and never read from the environment.
 */
export interface OperatorIdentity {
  observer?: KeyPair;
  ambient?: KeyPair;
  /** Suspicious configuration, for the CLI to print once. */
  warnings: string[];
}

/** Like {@link envKeyPair}, but a half-set pair is reported through `warnings` and treated as absent: every pair is optional (actions prompt), so none may abort the CLI at startup. */
function optionalKeyPair(env: NodeJS.ProcessEnv, accessVar: string, secretVar: string, warnings: string[]): KeyPair | undefined {
  try {
    return envKeyPair(env, accessVar, secretVar);
  } catch (error) {
    warnings.push(`${error instanceof Error ? error.message : String(error)}: ignoring the half-set pair.`);
    return undefined;
  }
}

export function resolveOperatorIdentity(env: NodeJS.ProcessEnv = process.env): OperatorIdentity {
  const warnings: string[] = [];
  const observer = optionalKeyPair(env, OBSERVER_KEY_NAMES.accessKey, OBSERVER_KEY_NAMES.secretKey, warnings);
  const ambient = optionalKeyPair(env, 'SCW_ACCESS_KEY', 'SCW_SECRET_KEY', warnings);
  return { observer, ambient, warnings };
}

/** Who bears an API key: an organization Owner, a member user, or an IAM application. */
export type BearerKind = 'owner' | 'member' | 'application';

export interface KeyDescription {
  accessKey: string;
  bearer: BearerKind;
  /** Application name or user email. */
  name: string;
  /** Application id or user id. */
  bearerId: string;
  expiresAt?: string;
  description?: string;
  /** The organization the bearer belongs to, as IAM reports it. */
  organizationId?: string;
}

/**
 * Describe an API key by asking IAM who bears it, authenticating with the key itself (every application the engine creates and every Owner key
 * holds IAM read). A key that cannot read IAM throws: it is neither an engine application nor an Owner API key, and the caller says so.
 */
export async function describeKey(pair: KeyPair, opts: { fetchImpl?: FetchLike } = {}): Promise<KeyDescription> {
  const auth: IamAuth = { secretKey: pair.secretKey, fetchImpl: resolveFetch(opts.fetchImpl) };
  const record = await getApiKey(auth, pair.accessKey);
  const base = { accessKey: pair.accessKey, expiresAt: record.expires_at ?? undefined, description: record.description || undefined };
  if (record.user_id) {
    const user = await scwFetch<{ email?: string; type?: string; organization_id?: string }>(auth, 'GET', `${IAM_BASE}/users/${record.user_id}`);
    return {
      ...base,
      bearer: user.type === 'owner' ? 'owner' : 'member',
      name: user.email ?? record.user_id,
      bearerId: record.user_id,
      organizationId: user.organization_id,
    };
  }
  if (record.application_id) {
    const app = await scwFetch<{ name?: string; organization_id?: string }>(auth, 'GET', `${IAM_BASE}/applications/${record.application_id}`);
    return {
      ...base,
      bearer: 'application',
      name: app.name ?? record.application_id,
      bearerId: record.application_id,
      organizationId: app.organization_id,
    };
  }
  throw new Error(`IAM returned no bearer for API key ${pair.accessKey}`);
}

/**
 * The organization a key works in, the one way the engine finds it: the env value when one is set, else what IAM says about the key's own
 * bearer, else the owner of the project through the Account API: the given project, or the key's default one before a project is known. An
 * application key holds IAM read and no right over the Account API, so the last ways serve user keys.
 */
export async function organizationIdOfKey(pair: KeyPair, projectId?: string, opts: { fetchImpl?: FetchLike } = {}): Promise<string> {
  const fromEnv = resolveOrganizationIdFromEnv();
  if (fromEnv) return fromEnv;
  const described = await describeKey(pair, opts).then(
    (desc) => desc.organizationId,
    () => undefined,
  );
  if (described) return described;
  const auth = { secretKey: pair.secretKey, fetchImpl: resolveFetch(opts.fetchImpl) };
  const project = projectId ?? (await getApiKey(auth, pair.accessKey)).default_project_id;
  if (!project) throw new Error(`API key ${pair.accessKey} names no project to find its organization by: set SCW_DEFAULT_ORGANIZATION_ID.`);
  return resolveOrganizationIdViaProject(auth, project);
}

/** The engine role of a key's bearer, or the kind of outside principal it is. */
export type PrincipalRole = 'ci-deploy' | 'admin' | 'operator' | 'observer' | 'vm-service' | 'owner' | 'member' | 'application';

export function classifyPrincipal(desc: KeyDescription, names: PrincipalNames & AppPrincipalNames): PrincipalRole {
  if (desc.bearer !== 'application') return desc.bearer;
  if (desc.name === names.ciDeploy) return 'ci-deploy';
  if (desc.name === names.admin) return 'admin';
  if (desc.name === names.operator) return 'operator';
  if (desc.name === names.observer) return 'observer';
  if (desc.name.startsWith(`${names.group}-vm-`)) return 'vm-service';
  return 'application';
}

const ROLE_LABELS: Record<PrincipalRole, string> = {
  'ci-deploy': 'CI deploy application',
  admin: 'admin application',
  operator: 'operator application',
  observer: 'observer application',
  'vm-service': 'VM service application',
  owner: 'organization Owner',
  member: 'member user',
  application: 'application',
};

/** One human line per key: bearer, role and expiry. */
export function formatKeyLine(desc: KeyDescription, role: PrincipalRole): string {
  const expiry = desc.expiresAt ? `, expires ${desc.expiresAt.slice(0, 16).replace('T', ' ')} UTC` : '';
  return `${desc.accessKey} → ${desc.name} (${ROLE_LABELS[role]}${expiry})`;
}

/** Hours until a key expires, negative when already expired, undefined for a key without expiry. */
export function hoursUntilExpiry(desc: KeyDescription, now = Date.now()): number | undefined {
  if (!desc.expiresAt) return undefined;
  return (Date.parse(desc.expiresAt) - now) / 3_600_000;
}

/** Where an Owner API key comes from, for every message that tells the operator how to get one. */
const OWNER_KEY_HOWTO = 'your own key as an organization Owner (console → your user → API keys)';

/**
 * A privileged run must be able to write IAM policies and privileged resources: an organization Owner, or a principal granted IAMManager.
 * Applications the engine created are rejected by name with the exact reason, so a CI or admin key pasted at the Owner API key prompt fails
 * here, in a second and before any lock is taken.
 */
export async function assertIamManager(opts: {
  pair: KeyPair;
  names: PrincipalNames & AppPrincipalNames;
  organizationId: string;
  fetchImpl?: FetchLike;
}): Promise<{ desc: KeyDescription; role: PrincipalRole }> {
  let desc: KeyDescription;
  try {
    desc = await describeKey(opts.pair, { fetchImpl: opts.fetchImpl });
  } catch (error) {
    throw new Error(
      `The supplied key cannot describe itself in IAM (${error instanceof Error ? error.message : String(error)}). An Owner API key is ${OWNER_KEY_HOWTO}, or the key of an application holding ProjectManager + IAMManager.`,
    );
  }
  const role = classifyPrincipal(desc, opts.names);
  if (role === 'ci-deploy' || role === 'admin' || role === 'observer' || role === 'vm-service') {
    throw new Error(
      `${formatKeyLine(desc, role)} is an application the engine created, not an Owner API key: it cannot write IAM policies or database privileges. Use ${OWNER_KEY_HOWTO}.`,
    );
  }
  if (role === 'owner') return { desc, role };
  const auth: IamAuth = { secretKey: opts.pair.secretKey, fetchImpl: resolveFetch(opts.fetchImpl) };
  const policies = await listOrganizationPolicies(auth, opts.organizationId);
  const bound = policies.filter((policy) =>
    desc.bearer === 'application' ? policy.application_id === desc.bearerId : policy.user_id === desc.bearerId,
  );
  for (const policy of bound) {
    const { rules = [] } = await scwFetch<{ rules?: Array<{ permission_set_names?: string[] }> }>(
      auth,
      'GET',
      `${IAM_BASE}/rules?policy_id=${policy.id}&page_size=100`,
    );
    if (rules.some((rule) => (rule.permission_set_names ?? []).includes('IAMManager'))) return { desc, role };
  }
  throw new Error(
    `${formatKeyLine(desc, role)} holds no IAMManager grant, so it cannot reconcile VM policies. Use ${OWNER_KEY_HOWTO}, or grant the application ProjectManager + IAMManager.`,
  );
}
