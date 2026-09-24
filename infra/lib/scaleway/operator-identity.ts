import type { FetchLike } from '../utils/fetch-like';
import { resolveFetch } from '../utils/fetch-like';
import { getApiKey, IAM_BASE, type IamAuth, listOrganizationPolicies } from './iam-client';
import type { PrincipalNames } from './principals';
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
 * - `admin`: `SCW_ADMIN_ACCESS_KEY` / `SCW_ADMIN_SECRET_KEY` from infra/.env.<mode>, the admin application's key: provider reads and the state bucket.
 * - `owner`: `SCW_OWNER_ACCESS_KEY` / `SCW_OWNER_SECRET_KEY`, the Owner API key (usually a `keychain:`/`op:` reference). Privileged actions use it,
 *   or mint a short-lived key from it, and prompt for one when it is absent.
 * - `ambient`: `SCW_ACCESS_KEY` / `SCW_SECRET_KEY` as the process found them (a CI runner, a shell export): shown in diagnostics, never written to the env file.
 * Deprecated pairs are read for one more release with a rename warning: `SCW_STATE_*` as the admin key, `SCW_BOOTSTRAP_*` as the Owner API key.
 */
export interface OperatorIdentity {
  admin?: KeyPair & { source: 'SCW_ADMIN_*' | 'SCW_STATE_*' };
  owner?: KeyPair & { source: 'SCW_OWNER_*' | 'SCW_BOOTSTRAP_*' };
  ambient?: KeyPair;
  /** Deprecated or suspicious configuration, for the CLI to print once. */
  warnings: string[];
}

/** Like {@link envKeyPair}, but a half-set pair is reported through `warnings` and treated as absent: every pair is optional (actions prompt), so none may abort the CLI at startup. */
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

  const adminPair = optionalKeyPair(env, 'SCW_ADMIN_ACCESS_KEY', 'SCW_ADMIN_SECRET_KEY', warnings);
  let admin: OperatorIdentity['admin'] = adminPair ? { ...adminPair, source: 'SCW_ADMIN_*' } : undefined;
  const statePair = optionalKeyPair(env, 'SCW_STATE_ACCESS_KEY', 'SCW_STATE_SECRET_KEY', warnings);
  if (statePair) {
    if (admin) {
      warnings.push(
        'SCW_STATE_ACCESS_KEY / SCW_STATE_SECRET_KEY are deprecated and ignored because SCW_ADMIN_* is set: remove the SCW_STATE_* pair.',
      );
    } else {
      admin = { ...statePair, source: 'SCW_STATE_*' };
      warnings.push(
        'SCW_STATE_ACCESS_KEY / SCW_STATE_SECRET_KEY are deprecated: rename them to SCW_ADMIN_ACCESS_KEY / SCW_ADMIN_SECRET_KEY (the admin application key).',
      );
    }
  }

  const ambient = optionalKeyPair(env, 'SCW_ACCESS_KEY', 'SCW_SECRET_KEY', warnings);

  const ownerPair = optionalKeyPair(env, 'SCW_OWNER_ACCESS_KEY', 'SCW_OWNER_SECRET_KEY', warnings);
  let owner: OperatorIdentity['owner'] = ownerPair ? { ...ownerPair, source: 'SCW_OWNER_*' } : undefined;
  // `SCW_BOOTSTRAP_*` named this key until 0.12, and `SCW_BOOTSTRAP_KEY` is the misspelling operators reached for.
  const legacyEnv: NodeJS.ProcessEnv = { ...env };
  if (!legacyEnv.SCW_BOOTSTRAP_ACCESS_KEY?.trim() && legacyEnv.SCW_BOOTSTRAP_KEY?.trim()) {
    legacyEnv.SCW_BOOTSTRAP_ACCESS_KEY = legacyEnv.SCW_BOOTSTRAP_KEY;
  }
  const legacyOwner = optionalKeyPair(legacyEnv, 'SCW_BOOTSTRAP_ACCESS_KEY', 'SCW_BOOTSTRAP_SECRET_KEY', warnings);
  if (legacyOwner) {
    if (owner) {
      warnings.push('SCW_BOOTSTRAP_* is ignored because SCW_OWNER_* is set: remove the SCW_BOOTSTRAP_* pair.');
    } else {
      owner = { ...legacyOwner, source: 'SCW_BOOTSTRAP_*' };
      warnings.push(
        'SCW_BOOTSTRAP_* is read as SCW_OWNER_ACCESS_KEY / SCW_OWNER_SECRET_KEY (the Owner API key): rename it.',
      );
    }
  }

  if (owner && admin && owner.accessKey === admin.accessKey) {
    warnings.push(
      'SCW_OWNER_* holds the same key as SCW_ADMIN_*: the Owner API key is your own user key as organization Owner, not the admin application key.',
    );
  }
  return { admin, owner, ambient, warnings };
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

/**
 * Describe an API key by asking IAM who bears it, authenticating with the key itself (every application the engine creates and every Owner key
 * holds IAM read). A key that cannot read IAM throws: it is neither an engine application nor an Owner API key, and the caller says so.
 */
export async function describeKey(pair: KeyPair, opts: { fetchImpl?: FetchLike } = {}): Promise<KeyDescription> {
  const auth: IamAuth = { secretKey: pair.secretKey, fetchImpl: resolveFetch(opts.fetchImpl) };
  const record = await getApiKey(auth, pair.accessKey);
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

/** Where an Owner API key comes from, for every message that tells the operator how to get one. */
export const OWNER_KEY_HOWTO = 'your own key as an organization Owner (console → your user → API keys)';

/**
 * A privileged run must be able to write IAM policies and privileged resources: an organization Owner, or a principal granted IAMManager.
 * Applications the engine created are rejected by name with the exact reason, so a CI or admin key pasted at the Owner API key prompt fails
 * here, in a second and before any lock is taken.
 */
export async function assertIamManager(opts: {
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
      `The supplied key cannot describe itself in IAM (${error instanceof Error ? error.message : String(error)}). An Owner API key is ${OWNER_KEY_HOWTO}, or the key of an application holding ProjectManager + IAMManager.`,
    );
  }
  const role = classifyPrincipal(desc, opts.names);
  if (role === 'ci-deploy' || role === 'admin' || role === 'boot' || role === 'vm-service') {
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
