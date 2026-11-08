import { actionCommand } from '../../lib/operator-actions';
import { describeKey, durableKeyLife, type KeyDescription, type KeyPair } from '../../lib/scaleway/operator-identity';
import { type AppPrincipalNames, allPrincipalNames, appPrincipalNames } from '../../lib/scaleway/principals';
import { stateKeyOf } from '../../lib/scaleway/s3-client';
import { findGroup } from '../../lib/scaleway/scaleway-iam';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { scwErrorStatus } from '../../lib/scaleway/scw-fetch';
import { crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { moveSecretsOutOfPrefix } from '../../tasks/move-secret-paths';
import { readCustodiedPassphrase, storeCustodiedPassphrase } from '../../tasks/passphrase-custody';
import { keyPairPrompt } from '../prompts/key-pair';
import { forgetOperatorKey, rememberedOperatorKey, rememberOperatorKey, setPassphraseCustody } from '../session';
import { endAction, type InfraContext } from '../shared';
import { acquireOwnerKey, type OwnerKey } from './owner-key';

type StackRef = Pick<InfraContext, 'appConfig' | 'environment' | 'projectId'>;

/** The console page where a person makes an application's key. */
export const OPERATOR_KEYS_URL = 'https://console.scaleway.com/iam/applications';

/** Where a person makes the key a session takes, for every refusal that sends them there. */
export function oneDayKeyHowto(names: AppPrincipalNames): string {
  return `Make one in the console: IAM → Applications → '${names.operator}' → API keys → Generate, expiring within a day; or your own key as a member of '${names.operators}', with the same expiration.`;
}

/**
 * Why Scaleway refused the key pasted at the prompt, in words the operator can act on. A 401 is a key Scaleway does not know; a 403 is a
 * key that reads no IAM, so it is neither the operator application's nor an operators group member's.
 */
export function refusalLines(opts: { status: number | undefined; detail: string; names: AppPrincipalNames }): string[] {
  const { names } = opts;
  if (opts.status === 401) return ['Scaleway does not know that secret key.', oneDayKeyHowto(names)];
  if (opts.status === 404) return ['Scaleway knows no such access key.', oneDayKeyHowto(names)];
  if (opts.status !== 403) return [`Scaleway did not take the key: ${opts.detail}`];
  return [
    `Scaleway refused the key: it reads no IAM, so it is no key of '${names.operator}' and none of a member of '${names.operators}'.`,
    `A policy change can take a few minutes to hold. The organization Owner makes both: \`${actionCommand('operator-key')}\`.`,
  ];
}

/** What a described key may unlock: the session in its organization, or nothing, with the reason. */
type BearerVerdict = { organizationId: string } | { refusal: string };

/**
 * Whether a described key unlocks the session: it is the operator application's or a user's who is in the operators group, and it ends
 * within a day (`durableKeyLife`). The group is read with the key itself, which the group's policy lets it do.
 */
async function bearerVerdict(desc: KeyDescription, pair: KeyPair, names: AppPrincipalNames): Promise<BearerVerdict> {
  const { organizationId } = desc;
  if (!organizationId) return { refusal: `${pair.accessKey} names no organization.` };
  if (desc.bearer === 'application') {
    if (desc.name !== names.operator) {
      return { refusal: `${pair.accessKey} is a key of '${desc.name}', not of '${names.operator}'. ${oneDayKeyHowto(names)}` };
    }
  } else {
    const group = await findGroup(pair.secretKey, organizationId, names.operators).catch(() => undefined);
    if (!group) {
      return {
        refusal: `The app has no operators group ('${names.operators}') that ${desc.name} could be in, or the key cannot read it. The organization Owner makes it: \`${actionCommand('operator-key')}\`.`,
      };
    }
    if (!(group.user_ids ?? []).includes(desc.bearerId)) {
      return {
        refusal: `${desc.name} is no member of '${names.operators}': the organization Owner adds members in the console (IAM → Groups → ${names.operators}), or paste a key of '${names.operator}'.`,
      };
    }
  }
  const life = durableKeyLife(desc);
  if (life) {
    return {
      refusal: `${pair.accessKey} would work ${life}, and a key that leaks must die within the day, so the session refuses it. ${oneDayKeyHowto(names)}`,
    };
  }
  return { organizationId };
}

/** Print why the key pasted at the prompt failed, drop it from the session, and end the action. */
function endOnRefusal(names: AppPrincipalNames, error: unknown): never {
  forgetOperatorKey();
  const [first, ...rest] = refusalLines({ status: scwErrorStatus(error), detail: errorMessage(error), names });
  console.error(`${crossMark} ${first}`);
  for (const line of rest) console.error(`  ${line}`);
  return endAction(1);
}

interface Unlocked {
  /** The operator key: it authenticates API calls and every privileged action of the session. */
  accessKey: string;
  secret: string;
  organizationId: string;
}

/**
 * Unlock the session: the operator key, both halves, typed once per run. It is proven by asking IAM who bears it, with the key itself: that
 * names the application or the user and its organization, and needs no right beyond the IAM read the operators hold. With `optional`, an
 * empty access key returns undefined: the caller then asks for what it needs in another way.
 */
async function unlock(stack: StackRef, opts: { optional?: string } = {}): Promise<Unlocked | undefined> {
  const names = appPrincipalNames(stack.appConfig.appSlug);
  let pair = rememberedOperatorKey();
  if (!pair) {
    pair = await keyPairPrompt({
      label: 'Operator key',
      howto: `Paste a key of '${names.operator}' that expires today, or your own as a member of '${names.operators}'.`,
      url: OPERATOR_KEYS_URL,
      optional: opts.optional,
    });
    if (!pair) return undefined;
  }
  let desc: KeyDescription;
  try {
    desc = await describeKey(pair);
  } catch (error) {
    return endOnRefusal(names, error);
  }
  const verdict = await bearerVerdict(desc, pair, names);
  if ('refusal' in verdict) {
    forgetOperatorKey();
    console.error(`${crossMark} ${verdict.refusal}`);
    return endAction(1);
  }
  rememberOperatorKey(pair);
  await unprefixSecrets(stack, pair.secretKey);
  return { accessKey: pair.accessKey, secret: pair.secretKey, organizationId: verdict.organizationId };
}

/** The projects whose secrets this run has moved out of their environment's prefix. */
const unprefixedProjects = new Set<string>();

/**
 * Move a stack's secrets out of its `/<slug>-<mode>/` prefix once per run, before anything of the session reads a folder: the passphrase
 * and the database passwords are read at their paths from the project's root. A move that fails ends the action, as what follows would
 * find those folders empty and make their secrets anew.
 */
async function unprefixSecrets(stack: StackRef, secretKey: string): Promise<void> {
  if (!stack.projectId || unprefixedProjects.has(stack.projectId)) return;
  const { slug } = stack.appConfig;
  const client = createSecretManagerClient({ secretKey, region: stack.appConfig.s3.region, projectId: stack.projectId });
  const left = await moveSecretsOutOfPrefix({ client, slug, mode: stack.environment, log: (message) => console.info(pc.dim(message)) }).catch(
    (error) => {
      console.error(`${crossMark} Could not move the secrets of ${stack.environment} out of /${slug}-${stack.environment}/: ${errorMessage(error)}`);
      return endAction(1);
    },
  );
  if (left.length > 0) {
    console.warn(
      `${warningMark} ${left.length} secret(s) stay under /${slug}-${stack.environment}/ beside a newer one of the same name: delete the stale ones.`,
    );
  }
  unprefixedProjects.add(stack.projectId);
}

let operatorNoticeShown = false;

/** The operator key a run holds: it ends within the day, writes no IAM, and is kept in memory for the session. */
export interface OperatorKey extends KeyPair {
  organizationId: string;
}

/**
 * The key every privileged action runs on: a one-day key of the operator application, or of a member of the operators group, pasted once
 * per session and kept in this process's memory. It holds no IAM write, so nothing is minted from it, and it ends by itself within the
 * day, so nothing is left to revoke when the action ends. An Owner key never runs one, as the buckets admit no Owner; an app without
 * operators gets them from `operator-key` or its setup, with an Owner API key.
 */
export async function acquireOperatorKey(stack: StackRef): Promise<OperatorKey> {
  const unlocked = await unlock(stack);
  if (!unlocked) return endAction(1);
  if (!operatorNoticeShown) {
    operatorNoticeShown = true;
    console.info(`${pc.dim('Operator key:')} ${unlocked.accessKey}`);
  }
  return { accessKey: unlocked.accessKey, secretKey: unlocked.secret, organizationId: unlocked.organizationId };
}

/**
 * The operator key, and the same key as the state side takes it: its access key names the environment's project, since Object Storage works
 * in a key's preferred project otherwise. The provider takes the plain key and finds the project by itself.
 */
export async function operatorKeys(stack: StackRef): Promise<{ key: KeyPair; state: KeyPair }> {
  const { accessKey, secretKey } = await acquireOperatorKey(stack);
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
 * Let the passphrase come from Secret Manager for this run. Reading it unlocks the session, so nobody types the passphrase; a person without
 * a key at hand leaves the prompt empty and types the passphrase as before. A passphrase typed while the session is unlocked is stored, which
 * is how an existing stack gets its copy.
 */
export function installPassphraseCustody(stack: StackRef): void {
  const custody = {
    secretKey: '',
    region: stack.appConfig.s3.region,
    projectId: stack.projectId,
  };
  setPassphraseCustody({
    async read() {
      const unlocked = await unlock(stack, { optional: 'Enter to type the recovery passphrase' });
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
