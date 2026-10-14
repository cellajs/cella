import { input } from '@inquirer/prompts';
import { actionCommand } from '../../lib/operator-actions';
import { fetchAppRulesByName, type GrantedRule, IAM_BASE } from '../../lib/scaleway/iam-client';
import { ipAllowed, ipConditionCidrs } from '../../lib/scaleway/ip-lock';
import { describeKey, type KeyDescription, organizationIdOfKey, resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { type PrincipalNames, principalNames } from '../../lib/scaleway/principals';
import { scwErrorStatus, scwFetch } from '../../lib/scaleway/scw-fetch';
import { crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { readCustodiedPassphrase, storeCustodiedPassphrase } from '../../tasks/passphrase-custody';
import { maskedSecret } from '../prompts/masked-secret';
import {
  forgetOperatorKey,
  type OperatorLock,
  rememberedOperatorKey,
  rememberedOperatorLock,
  rememberOperatorKey,
  rememberOperatorLock,
  setPassphraseCustody,
} from '../session';
import { endAction, type InfraContext } from '../shared';
import { acquireOwnerKey, type OwnerKey } from './owner-key';

type StackRef = Pick<InfraContext, 'appConfig' | 'environment' | 'projectId'>;

/**
 * What the operator application's rules say about its address lock. Every rule must carry the same readable condition: one rule without it
 * admits the key from every address, so that policy counts as open and names no address.
 */
export function readOperatorLock(rules: readonly Pick<GrantedRule, 'condition'>[]): { cidrs: string[]; open: boolean } {
  const conditions = new Set(rules.map((rule) => rule.condition));
  const [only] = [...conditions];
  const cidrs = conditions.size === 1 ? ipConditionCidrs(only) : [];
  return { cidrs, open: rules.length > 0 && cidrs.length === 0 };
}

/**
 * Whether the stack has an operator application and which addresses its policy names, read with the admin application key (IAM read). Kept
 * for the run: an action that changes it calls `forgetOperatorLock`. Without an admin key on this machine the answer is `unknown`.
 */
export async function operatorLock(stack: StackRef): Promise<OperatorLock> {
  const known = rememberedOperatorLock();
  if (known) return known;
  const { admin } = resolveOperatorIdentity();
  let lock: OperatorLock = { state: 'unknown', cidrs: [], open: false };
  if (admin && stack.projectId) {
    try {
      const organizationId = await organizationIdOfKey(admin, stack.projectId);
      const names = principalNames(stack.appConfig.slug, stack.environment);
      const rules = await fetchAppRulesByName({
        secretKey: admin.secretKey,
        projectId: stack.projectId,
        applicationName: names.operator,
        organizationId,
      });
      lock = rules === null ? { state: 'absent', cidrs: [], open: false } : { state: 'present', ...readOperatorLock(rules) };
    } catch {
      // Left unknown: the admin application key could not read IAM just now.
    }
  }
  rememberOperatorLock(lock);
  return lock;
}

/** One line on where this machine stands against the address lock, for a refusal message and the menu header. */
export function addressVerdict(address: string | undefined, lock: OperatorLock): 'inside' | 'outside' | 'unknown' {
  if (!address || lock.cidrs.length === 0) return 'unknown';
  return ipAllowed(address, lock.cidrs) ? 'inside' : 'outside';
}

/**
 * Why Scaleway refused a call made with the operator key, in words the operator can act on. A 401 is a key Scaleway does not know. A 403 is
 * most often the address: the key works from the dedicated address only, and from elsewhere the answer is the same as for a missing right.
 */
export function refusalLines(opts: {
  status: number | undefined;
  detail: string;
  names: PrincipalNames;
  address?: string;
  lock: OperatorLock;
}): string[] {
  const { names, address, lock } = opts;
  if (opts.status === 401) {
    return [`Scaleway does not know that secret key. Paste the key of '${names.operator}' from your password manager.`];
  }
  if (opts.status === 404) {
    return [`Scaleway knows no such access key. Paste the key of '${names.operator}' from your password manager.`];
  }
  if (opts.status !== 403) return [`Scaleway did not take the operator key: ${opts.detail}`];
  const from = address ? `This machine reaches the internet as ${address}` : 'The address of this machine could not be detected';
  const allowed =
    lock.cidrs.length > 0
      ? `the key works from ${lock.cidrs.join(', ')} only`
      : `the key works from the dedicated address of '${names.operator}' only`;
  const verdict = addressVerdict(address, lock);
  return [
    'Scaleway refused the operator key.',
    `${from}; ${allowed}.`,
    verdict === 'inside'
      ? 'The address is on the list, so this is not the address: a policy change can take a few minutes to hold, or the key is not the operator key.'
      : 'Connect through the dedicated address and try again.',
    `If the dedicated address changed, the organization Owner sets the new one: \`${actionCommand('operator-key')}\`.`,
  ];
}

let detectedAddress: Promise<string | undefined> | undefined;

/** This machine's public IPv4 address, asked from a public echo service once per run. */
export function publicAddress(): Promise<string | undefined> {
  detectedAddress ??= fetch('https://api.ipify.org', { signal: AbortSignal.timeout(5000) }).then(
    async (res) => (res.ok ? (await res.text()).trim() || undefined : undefined),
    () => undefined,
  );
  return detectedAddress;
}

/** Print why a call with the operator key failed, drop the key from the session, and end the action. */
async function endOnRefusal(stack: StackRef, names: PrincipalNames, error: unknown): Promise<never> {
  forgetOperatorKey();
  const status = scwErrorStatus(error);
  const [first, ...rest] = refusalLines({
    status,
    detail: errorMessage(error),
    names,
    address: status === 403 ? await publicAddress() : undefined,
    lock: await operatorLock(stack),
  });
  console.error(`${crossMark} ${first}`);
  for (const line of rest) console.error(`  ${line}`);
  return endAction(1);
}

interface Unlocked {
  /** The operator key: it authenticates API calls and every privileged action of the session. */
  accessKey: string;
  secret: string;
  organizationId: string;
  applicationId: string;
}

/**
 * Unlock the session: the operator key, both halves, typed once per run. It is proven by asking IAM who bears it, with the key itself: that
 * names the application and its organization, and needs no right beyond the IAM read the operator holds. With `optional`, an empty access
 * key returns undefined: the caller then asks for what it needs in another way.
 */
async function unlock(stack: StackRef, opts: { optional?: string } = {}): Promise<Unlocked | undefined> {
  const names = principalNames(stack.appConfig.slug, stack.environment);
  let pair = rememberedOperatorKey();
  if (!pair) {
    const label = `Operator key of '${names.operator}'`;
    const accessKey = (await input({ message: `${label}, access key${opts.optional ? ` ${pc.dim(`(${opts.optional})`)}` : ''}` })).trim();
    const secretKey = accessKey ? (await maskedSecret({ message: `${label}, secret key` })).trim() : '';
    if (!accessKey || !secretKey) {
      if (opts.optional && !accessKey) return undefined;
      console.error(`${crossMark} No key given.`);
      return endAction(1);
    }
    pair = { accessKey, secretKey };
  }
  let desc: KeyDescription;
  try {
    desc = await describeKey(pair);
  } catch (error) {
    return endOnRefusal(stack, names, error);
  }
  if (desc.bearer !== 'application' || desc.name !== names.operator || !desc.organizationId) {
    forgetOperatorKey();
    console.error(
      `${crossMark} ${pair.accessKey} is a key of '${desc.name}', not of '${names.operator}'. The operator key is created once per app with your Owner API key: \`${actionCommand('operator-key')}\`.`,
    );
    return endAction(1);
  }
  rememberOperatorKey(pair);
  return { accessKey: pair.accessKey, secret: pair.secretKey, organizationId: desc.organizationId, applicationId: desc.bearerId };
}

/** One IAM read with a key: true when Scaleway accepts it from this address. */
export async function keyAccepted(secretKey: string, organizationId: string): Promise<true | undefined> {
  return scwFetch({ secretKey }, 'GET', `${IAM_BASE}/applications?organization_id=${organizationId}&page_size=1`).then(
    () => true as const,
    () => undefined,
  );
}

let operatorNoticeShown = false;

/**
 * The key for a privileged action under the operator application: the operator key itself, pasted once per session and kept in this
 * process's memory. Scaleway accepts it from the dedicated address only, and it holds no IAM write, so nothing is minted from it and nothing
 * is left to revoke when the action ends.
 */
export async function acquireOperatorKey(stack: StackRef): Promise<OwnerKey> {
  const names = principalNames(stack.appConfig.slug, stack.environment);
  const unlocked = await unlock(stack);
  if (!unlocked) return endAction(1);
  if (!operatorNoticeShown) {
    operatorNoticeShown = true;
    console.info(`${pc.dim('Operator key:')} ${names.operator} ${pc.dim(unlocked.accessKey)}`);
  }
  return {
    accessKey: unlocked.accessKey,
    secretKey: unlocked.secret,
    organizationId: unlocked.organizationId,
    minted: false,
    pasted: false,
    release: async () => {},
  };
}

let ownerNoticeShown = false;

/**
 * The key a privileged action runs on. A stack with an operator application takes the operator key, which works from the dedicated address
 * only. A stack that has none yet takes an Owner API key at the prompt, with a pointer to the action that sets the operator key up.
 */
export async function acquirePrivilegedKey(stack: StackRef): Promise<OwnerKey> {
  const lock = await operatorLock(stack);
  if (lock.state !== 'absent') return acquireOperatorKey(stack);
  const names = principalNames(stack.appConfig.slug, stack.environment);
  if (!ownerNoticeShown) {
    ownerNoticeShown = true;
    console.info(
      pc.dim(`This stack has no operator key yet, so the action takes your Owner API key. \`${actionCommand('operator-key')}\` sets one up.`),
    );
  }
  return acquireOwnerKey({ names, projectId: stack.projectId, slug: stack.appConfig.slug, mode: stack.environment });
}

/**
 * The key for an action that writes IAM: applications, policies, keys. The operator key holds no IAM write, so this is always an Owner API
 * key, made in the console for the occasion and typed at the prompt.
 */
export async function acquireIdentityKey(stack: StackRef, why: string): Promise<OwnerKey> {
  const names = principalNames(stack.appConfig.slug, stack.environment);
  console.info(pc.dim(`${why} That writes IAM, which the operator key cannot: it takes your Owner API key.`));
  return acquireOwnerKey({ names, projectId: stack.projectId, slug: stack.appConfig.slug, mode: stack.environment });
}

/**
 * Let the passphrase come from Secret Manager for this run. Reading it unlocks the session, so nobody types the passphrase; a stack without
 * an operator application has nothing to unlock with, and the passphrase is typed as before. A passphrase typed while the session is
 * unlocked is stored, which is how an existing stack gets its copy.
 */
export function installPassphraseCustody(stack: StackRef): void {
  const custody = {
    secretKey: '',
    region: stack.appConfig.s3.region,
    projectId: stack.projectId,
    slug: stack.appConfig.slug,
    mode: stack.environment,
  };
  setPassphraseCustody({
    async read() {
      if ((await operatorLock(stack)).state === 'absent') return undefined;
      const unlocked = await unlock(stack, { optional: 'Enter to type the Pulumi passphrase' });
      if (!unlocked) return undefined;
      return readCustodiedPassphrase({ ...custody, secretKey: unlocked.secret }).catch((error) => {
        console.warn(`${warningMark} Could not read the passphrase from Secret Manager (${errorMessage(error)}); type it once.`);
        return undefined;
      });
    },
    async store(passphrase) {
      const key = rememberedOperatorKey();
      if (!key) return false;
      return storeCustodiedPassphrase({ ...custody, secretKey: key.secretKey, passphrase }).then(
        () => true,
        (error) => {
          console.warn(`${warningMark} Could not store the passphrase in Secret Manager (${errorMessage(error)}); it is asked again next time.`);
          return false;
        },
      );
    },
  });
}
