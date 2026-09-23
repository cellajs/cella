import type { FetchLike } from '../utils/fetch-like';
import { resolveFetch } from '../utils/fetch-like';
import { IAM_BASE, type IamAuth, listOrganizationPolicies } from './iam-client';
import type { PrincipalNames } from './principals';
import { scwFetch } from './scw-fetch';

export interface KeyPair {
  accessKey: string;
  secretKey: string;
}

/** Which env pair supplied a key, for diagnostics. */
export type KeySource = 'SCW_*' | 'SCW_STATE_*' | 'SCW_BOOTSTRAP_*';

/** All-or-nothing env pair: a half-set pair is a configuration error, never a fallback (an access key from one pair with the secret of another produced unexplainable 403s). */
export function envKeyPair(env: NodeJS.ProcessEnv, accessVar: string, secretVar: string): KeyPair | undefined {
  const accessKey = env[accessVar]?.trim() || undefined;
  const secretKey = env[secretVar]?.trim() || undefined;
  if (!!accessKey !== !!secretKey) throw new Error(`${accessVar} and ${secretVar} must be set together`);
  return accessKey && secretKey ? { accessKey, secretKey } : undefined;
}

/**
 * Every credential an operator process may hold, resolved in one place so the CLI actions cannot drift apart in which env pair they read.
 * - `standing`: `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` from infra/.env.<mode>, the admin application's key. Provider reads and the state bucket.
 * - `state`: the identity for every state-bucket touch (login, lock, control object). The deprecated `SCW_STATE_*` override wins, else the standing key.
 * - `bootstrap`: `SCW_BOOTSTRAP_ACCESS_KEY` / `SCW_BOOTSTRAP_SECRET_KEY` when supplied via env; privileged actions prompt otherwise.
 */
export interface OperatorIdentity {
  standing?: KeyPair & { source: 'SCW_*' };
  state?: KeyPair & { source: 'SCW_*' | 'SCW_STATE_*' };
  bootstrap?: KeyPair & { source: 'SCW_BOOTSTRAP_*' };
  /** `SCW_OWNER_ACCESS_KEY` / `SCW_OWNER_SECRET_KEY`: an organization Owner's standing key, usually a `keychain:`/`op:` reference, from which privileged actions mint a short-lived bootstrap key. */
  owner?: KeyPair & { source: 'SCW_OWNER_*' };
  /** Deprecated or suspicious configuration, for the CLI to print once. */
  warnings: string[];
}

/** Like {@link envKeyPair}, but a half-set pair is reported through `warnings` and treated as absent: the standing key is optional (actions prompt), so it must not abort the CLI at startup. */
function optionalKeyPair(
  env: NodeJS.ProcessEnv,
  accessVar: string,
  secretVar: string,
  warnings: string[],
): KeyPair | undefined {
  try {
    return envKeyPair(env, accessVar, secretVar);
  } catch (error) {
    warnings.push(`${error instanceof Error ? error.message : String(error)}: ignoring the half-set pair.`);
    return undefined;
  }
}

export function resolveOperatorIdentity(env: NodeJS.ProcessEnv = process.env): OperatorIdentity {
  const warnings: string[] = [];
  const standing = optionalKeyPair(env, 'SCW_ACCESS_KEY', 'SCW_SECRET_KEY', warnings);
  const stateOverride = envKeyPair(env, 'SCW_STATE_ACCESS_KEY', 'SCW_STATE_SECRET_KEY');
  if (stateOverride) {
    warnings.push(
      stateOverride.accessKey === standing?.accessKey
        ? 'SCW_STATE_ACCESS_KEY / SCW_STATE_SECRET_KEY repeat SCW_ACCESS_KEY / SCW_SECRET_KEY: remove the SCW_STATE_* pair, it is no longer needed.'
        : 'SCW_STATE_ACCESS_KEY / SCW_STATE_SECRET_KEY are deprecated: put the admin application key in SCW_ACCESS_KEY / SCW_SECRET_KEY (it is admitted to the state bucket) and remove the SCW_STATE_* pair.',
    );
  }
  // `SCW_BOOTSTRAP_KEY` is the misspelling operators reach for; honour it and nudge them to rename it.
  const bootstrapEnv: NodeJS.ProcessEnv = { ...env };
  if (!bootstrapEnv.SCW_BOOTSTRAP_ACCESS_KEY?.trim() && bootstrapEnv.SCW_BOOTSTRAP_KEY?.trim()) {
    bootstrapEnv.SCW_BOOTSTRAP_ACCESS_KEY = bootstrapEnv.SCW_BOOTSTRAP_KEY;
    warnings.push('SCW_BOOTSTRAP_KEY is read as SCW_BOOTSTRAP_ACCESS_KEY: rename it.');
  }
  const bootstrap = envKeyPair(bootstrapEnv, 'SCW_BOOTSTRAP_ACCESS_KEY', 'SCW_BOOTSTRAP_SECRET_KEY');
  const owner = envKeyPair(env, 'SCW_OWNER_ACCESS_KEY', 'SCW_OWNER_SECRET_KEY');
  if (owner && standing && owner.accessKey === standing.accessKey) {
    warnings.push(
      'SCW_OWNER_* holds the same key as SCW_ACCESS_KEY: the Owner key must be your own Personal API Key, not the admin application key.',
    );
  }
  if (bootstrap && standing && bootstrap.accessKey === standing.accessKey) {
    warnings.push(
      'SCW_BOOTSTRAP_* holds the same key as SCW_ACCESS_KEY: a bootstrap key must be a separate, short-lived Owner key.',
    );
  }
  return {
    standing: standing ? { ...standing, source: 'SCW_*' } : undefined,
    state: stateOverride
      ? { ...stateOverride, source: 'SCW_STATE_*' }
      : standing
        ? { ...standing, source: 'SCW_*' }
        : undefined,
    bootstrap: bootstrap ? { ...bootstrap, source: 'SCW_BOOTSTRAP_*' } : undefined,
    owner: owner ? { ...owner, source: 'SCW_OWNER_*' } : undefined,
    warnings,
  };
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
}

interface ScwApiKeyRecord {
  access_key: string;
  description?: string;
  expires_at?: string | null;
  application_id?: string | null;
  user_id?: string | null;
}

/**
 * Describe an API key by asking IAM who bears it, authenticating with the key itself (every engine principal and every Owner key holds IAM read).
 * A key that cannot read IAM throws: it is neither an engine principal nor bootstrap-capable, and the caller says so.
 */
export async function describeKey(pair: KeyPair, opts: { fetchImpl?: FetchLike } = {}): Promise<KeyDescription> {
  const auth: IamAuth = { secretKey: pair.secretKey, fetchImpl: resolveFetch(opts.fetchImpl) };
  const record = await scwFetch<ScwApiKeyRecord>(auth, 'GET', `${IAM_BASE}/api-keys/${pair.accessKey}`);
  const base = {
    accessKey: pair.accessKey,
    expiresAt: record.expires_at ?? undefined,
    description: record.description || undefined,
  };
  if (record.user_id) {
    const user = await scwFetch<{ email?: string; type?: string }>(auth, 'GET', `${IAM_BASE}/users/${record.user_id}`);
    return {
      ...base,
      bearer: user.type === 'owner' ? 'owner' : 'member',
      name: user.email ?? record.user_id,
      bearerId: record.user_id,
    };
  }
  if (record.application_id) {
    const app = await scwFetch<{ name?: string }>(auth, 'GET', `${IAM_BASE}/applications/${record.application_id}`);
    return { ...base, bearer: 'application', name: app.name ?? record.application_id, bearerId: record.application_id };
  }
  throw new Error(`IAM returned no bearer for API key ${pair.accessKey}`);
}

/** The engine role of a key's bearer, or the kind of outside principal it is. */
export type PrincipalRole = 'ci-deploy' | 'admin' | 'boot' | 'vm-service' | 'owner' | 'member' | 'application';

export function classifyPrincipal(desc: KeyDescription, names: PrincipalNames): PrincipalRole {
  if (desc.bearer !== 'application') return desc.bearer;
  if (desc.name === names.ciDeploy) return 'ci-deploy';
  if (desc.name === names.admin) return 'admin';
  if (desc.name === names.boot) return 'boot';
  if (desc.name.startsWith(`${names.group}-vm-`)) return 'vm-service';
  return 'application';
}

const ROLE_LABELS: Record<PrincipalRole, string> = {
  'ci-deploy': 'CI deploy application',
  admin: 'admin application',
  boot: 'boot application',
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

/**
 * A bootstrap key must be able to write IAM policies and bootstrap-owned resources: an organization Owner, or a principal granted IAMManager.
 * Engine principals are rejected by name with the exact reason, so a CI or admin key pasted at the bootstrap prompt fails here, in a second and
 * before any lock is taken.
 */
export async function assertBootstrapCapable(opts: {
  pair: KeyPair;
  names: PrincipalNames;
  organizationId: string;
  fetchImpl?: FetchLike;
}): Promise<{ desc: KeyDescription; role: PrincipalRole }> {
  let desc: KeyDescription;
  try {
    desc = await describeKey(opts.pair, { fetchImpl: opts.fetchImpl });
  } catch (error) {
    throw new Error(
      `The supplied bootstrap key cannot describe itself in IAM (${error instanceof Error ? error.message : String(error)}). A bootstrap key is a fresh Personal API Key of an organization Owner, or a key of an application holding ProjectManager + IAMManager.`,
    );
  }
  const role = classifyPrincipal(desc, opts.names);
  if (role === 'ci-deploy' || role === 'admin' || role === 'boot' || role === 'vm-service') {
    throw new Error(
      `${formatKeyLine(desc, role)} is an engine principal, not a bootstrap key. It cannot write IAM policies or database privileges. Generate a fresh Personal API Key as an organization Owner (console → user menu → API keys) and paste that.`,
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
    `${formatKeyLine(desc, role)} holds no IAMManager grant, so it cannot reconcile VM policies. Use an organization Owner's Personal API Key, or grant the application ProjectManager + IAMManager.`,
  );
}
