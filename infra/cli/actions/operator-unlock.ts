import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { input } from '@inquirer/prompts';
import { actionCommand } from '../../lib/operator-actions';
import { fetchAppRulesByName, type GrantedRule, IAM_BASE } from '../../lib/scaleway/iam-client';
import { ipAllowed, ipConditionCidrs } from '../../lib/scaleway/ip-lock';
import { describeKey, type KeyDescription, type KeyPair, organizationIdOfKey, resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { type AppPrincipalNames, allPrincipalNames, appPrincipalNames } from '../../lib/scaleway/principals';
import { stateKeyOf } from '../../lib/scaleway/s3-client';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { scwErrorStatus, scwFetch } from '../../lib/scaleway/scw-fetch';
import { crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { moveSecretPaths } from '../../tasks/move-secret-paths';
import { ensureCustodiedSalt, readCustodiedPassphrase, storeCustodiedPassphrase } from '../../tasks/passphrase-custody';
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
 * Whether the stack has an operator application and which addresses its policy names, read with the observer key (IAM read). Kept for
 * the run: an action that changes it calls `forgetOperatorLock`. Without an observer key on this machine the answer is `unknown`.
 */
export async function operatorLock(stack: StackRef): Promise<OperatorLock> {
  const known = rememberedOperatorLock();
  if (known) return known;
  const { observer } = resolveOperatorIdentity();
  let lock: OperatorLock = { state: 'unknown', cidrs: [], open: false };
  if (observer && stack.projectId) {
    try {
      const organizationId = await organizationIdOfKey(observer, stack.projectId);
      const names = appPrincipalNames(stack.appConfig.appSlug);
      const rules = await fetchAppRulesByName({
        secretKey: observer.secretKey,
        projectId: stack.projectId,
        applicationName: names.operator,
        organizationId,
      });
      lock = rules === null ? { state: 'absent', cidrs: [], open: false } : { state: 'present', ...readOperatorLock(rules) };
    } catch {
      // Left unknown: the observer key could not read IAM just now.
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
  names: AppPrincipalNames;
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
async function endOnRefusal(stack: StackRef, names: AppPrincipalNames, error: unknown): Promise<never> {
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
 * key returns undefined: the caller then asks for what it needs in another way. With `operator`, the key of that application is asked for,
 * as an organization's runner has an operator of its own (Q1): it reaches none of the app's projects, so the session does not keep it.
 */
async function unlock(stack: StackRef, opts: { optional?: string; operator?: string } = {}): Promise<Unlocked | undefined> {
  const names = { ...appPrincipalNames(stack.appConfig.appSlug), ...(opts.operator ? { operator: opts.operator } : {}) };
  let pair = opts.operator ? undefined : rememberedOperatorKey();
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
  if (!opts.operator) {
    rememberOperatorKey(pair);
    await moveSecretsOutOfPrefix(stack, pair.secretKey);
  }
  return { accessKey: pair.accessKey, secret: pair.secretKey, organizationId: desc.organizationId, applicationId: desc.bearerId };
}

/** The projects whose secrets this run has moved out of their environment's prefix. */
const unprefixedProjects = new Set<string>();

/**
 * Move a stack's secrets out of its `/<slug>-<mode>/` prefix once per run, before anything of the session reads a folder: the passphrase,
 * the database passwords, the machine keys and every copy are read at their paths from the project's root (tasks/move-secret-paths.ts). A
 * move that fails ends the action, as what follows would find those folders empty and make their secrets anew.
 */
async function moveSecretsOutOfPrefix(stack: StackRef, secretKey: string): Promise<void> {
  if (!stack.projectId || unprefixedProjects.has(stack.projectId)) return;
  const { slug } = stack.appConfig;
  const client = createSecretManagerClient({ secretKey, region: stack.appConfig.s3.region, projectId: stack.projectId });
  const left = await moveSecretPaths({ client, slug, mode: stack.environment, log: (message) => console.info(pc.dim(message)) }).catch((error) => {
    console.error(`${crossMark} Could not move the secrets of ${stack.environment} out of /${slug}-${stack.environment}/: ${errorMessage(error)}`);
    return endAction(1);
  });
  if (left.length > 0) {
    console.warn(
      `${warningMark} ${left.length} secret(s) stay under /${slug}-${stack.environment}/ beside a newer one of the same name: delete the stale ones.`,
    );
  }
  unprefixedProjects.add(stack.projectId);
}

/** One IAM read with a key: true when Scaleway accepts it from this address. */
export async function keyAccepted(secretKey: string, organizationId: string): Promise<true | undefined> {
  return scwFetch({ secretKey }, 'GET', `${IAM_BASE}/applications?organization_id=${organizationId}&page_size=1`).then(
    () => true as const,
    () => undefined,
  );
}

let operatorNoticeShown = false;

/** The operator key a run holds: works from the dedicated address only, writes no IAM, and is kept in memory for the session. */
export interface OperatorKey extends KeyPair {
  organizationId: string;
}

/**
 * The key for a privileged action under the operator application: the operator key itself, pasted once per session and kept in this
 * process's memory. Scaleway accepts it from the dedicated address only, and it holds no IAM write, so nothing is minted from it and nothing
 * is left to revoke when the action ends. `operator` names another operator application, asked for each time.
 */
export async function acquireOperatorKey(stack: StackRef, operator?: string): Promise<OperatorKey> {
  const name = operator ?? appPrincipalNames(stack.appConfig.appSlug).operator;
  const unlocked = await unlock(stack, { operator });
  if (!unlocked) return endAction(1);
  if (!operatorNoticeShown) {
    operatorNoticeShown = true;
    console.info(`${pc.dim('Operator key:')} ${name} ${pc.dim(unlocked.accessKey)}`);
  }
  return { accessKey: unlocked.accessKey, secretKey: unlocked.secret, organizationId: unlocked.organizationId };
}

/**
 * The key a privileged action runs on: the operator key, which works from the dedicated address only. An Owner key never runs one, as the
 * buckets admit no person; an app without an operator gets one from `operator-key` or its setup, with an Owner API key.
 */
export async function acquirePrivilegedKey(stack: StackRef): Promise<OperatorKey> {
  const lock = await operatorLock(stack);
  if (lock.state === 'absent') {
    const names = appPrincipalNames(stack.appConfig.appSlug);
    console.error(
      `${crossMark} The app has no operator ('${names.operator}') yet: \`${actionCommand('operator-key')}\` makes it, with your Owner API key.`,
    );
    return endAction(1);
  }
  return acquireOperatorKey(stack);
}

/**
 * The operator key, and the same key as the state side takes it: its access key names the environment's project, since Object Storage works
 * in a key's preferred project otherwise. The provider takes the plain key and finds the project by itself.
 */
export async function operatorKeys(stack: StackRef): Promise<{ key: KeyPair; state: KeyPair }> {
  const { accessKey, secretKey } = await acquirePrivilegedKey(stack);
  return { key: { accessKey, secretKey }, state: stateKeyOf({ accessKey, secretKey }, stack.projectId) };
}

/**
 * The key for an action that writes IAM: applications, policies, keys. The operator key holds no IAM write, so this is always an Owner API
 * key, made in the console for the occasion and typed at the prompt.
 */
export async function acquireIdentityKey(stack: StackRef, why: string): Promise<OwnerKey> {
  const names = allPrincipalNames(stack.appConfig, stack.environment);
  console.info(pc.dim(`${why} That writes IAM, which the operator key cannot: it takes your Owner API key.`));
  return acquireOwnerKey({ names, projectId: stack.projectId, slug: stack.appConfig.slug, mode: stack.environment });
}

/**
 * Let the passphrase come from Secret Manager for this run. Reading it unlocks the session, so nobody types the passphrase; a stack without
 * an operator application has nothing to unlock with, and the passphrase is typed as before. A passphrase typed while the session is
 * unlocked is stored, which is how an existing stack gets its copy; the stack file's salt goes beside it, from this checkout when it verifies.
 */
export function installPassphraseCustody(stack: StackRef): void {
  const stackYaml = () => {
    const file = join(infraDir, `Pulumi.${stack.environment}.yaml`);
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  };
  const custody = {
    secretKey: '',
    region: stack.appConfig.s3.region,
    projectId: stack.projectId,
  };
  setPassphraseCustody({
    async read() {
      if ((await operatorLock(stack)).state === 'absent') return undefined;
      const unlocked = await unlock(stack, { optional: 'Enter to type the Pulumi passphrase' });
      if (!unlocked) return undefined;
      const passphrase = await readCustodiedPassphrase({ ...custody, secretKey: unlocked.secret }).catch((error) => {
        console.warn(`${warningMark} Could not read the passphrase from Secret Manager (${errorMessage(error)}); type it once.`);
        return undefined;
      });
      if (passphrase) {
        await ensureCustodiedSalt({ ...custody, secretKey: unlocked.secret, passphrase, stackYaml: stackYaml() }).catch((error) =>
          console.warn(`${warningMark} Could not store the stack's salt beside the passphrase (${errorMessage(error)}).`),
        );
      }
      return passphrase;
    },
    async store(passphrase) {
      const key = rememberedOperatorKey();
      if (!key) return false;
      return storeCustodiedPassphrase({ ...custody, secretKey: key.secretKey, passphrase, stackYaml: stackYaml() }).then(
        () => true,
        (error) => {
          console.warn(`${warningMark} Could not store the passphrase in Secret Manager (${errorMessage(error)}); it is asked again next time.`);
          return false;
        },
      );
    },
  });
}
