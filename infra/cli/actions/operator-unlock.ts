import { menuPath } from '../../lib/operator-actions';
import { describeKey, durableKeyLife, endingKeyMinutes, type KeyDescription, type KeyPair } from '../../lib/scaleway/operator-identity';
import { type AppPrincipalNames, allPrincipalNames, appPrincipalNames } from '../../lib/scaleway/principals';
import { stateKeyOf } from '../../lib/scaleway/s3-client';
import { findGroup } from '../../lib/scaleway/scaleway-iam';
import { scwErrorStatus, scwUnanswered } from '../../lib/scaleway/scw-fetch';
import { crossMark, pc, withSpinner } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { sleep } from '../../lib/utils/sleep';
import { keyPairPrompt } from '../prompts/key-pair';
import { keptKeyNote, LEAVE, leaveRow, type WayOut, whatNow } from '../prompts/what-now';
import { forgetOperatorKey, operatorKeyMintedThisRun, rememberedOperatorKey, rememberOperatorKey } from '../session';
import { endAction, type InfraContext } from '../shared';
import { acquireOwnerKey, type OwnerKey } from './owner-key';

type StackRef = Pick<InfraContext, 'appConfig' | 'environment' | 'projectId'>;

/** Where a person makes the key a session takes, for every refusal that sends them there. */
export function oneDayKeyHowto(names: AppPrincipalNames): string {
  return `Make one in the console: IAM → API keys → Generate, with '${names.operator}' as its bearer, expiring within a day; or your own key as a member of '${names.operators}', with the same expiration.`;
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
    `Scaleway refused the key (403): it reads no IAM, so it is no key of '${names.operator}' and none of a member of '${names.operators}'.`,
    `Made it a few minutes ago? Its access can take a few minutes to hold. The organization Owner makes both: "${menuPath('operators')}".`,
  ];
}

/** What a described key may unlock: the session in its organization, or nothing, with the reason. */
type BearerVerdict = { organizationId: string } | { refusal: string };

/**
 * Whether a described key unlocks the session: it is the operator application's or a user's who is in the operators group, it ends
 * within a day (`durableKeyLife`) and not within the action it starts (`endingKeyMinutes`). The group is read with the key itself, which
 * the group's policy lets it do.
 */
async function bearerVerdict(desc: KeyDescription, pair: KeyPair, names: AppPrincipalNames): Promise<BearerVerdict> {
  const { organizationId } = desc;
  if (!organizationId) return { refusal: `${pair.accessKey} names no organization.` };
  if (desc.bearer === 'application') {
    if (desc.name !== names.operator) {
      return { refusal: `${pair.accessKey} is a key of '${desc.name}', not of '${names.operator}'. ${oneDayKeyHowto(names)}` };
    }
  } else {
    // A read Scaleway did not answer is no verdict on the key: it goes to the caller, which keeps the key.
    const group = await findGroup(pair.secretKey, organizationId, names.operators).catch((error: unknown) => {
      if (scwUnanswered(error)) throw error;
      return undefined;
    });
    if (!group) {
      return {
        refusal: `The app has no operators group ('${names.operators}') that ${desc.name} could be in, or the key cannot read it. The organization Owner makes it: "${menuPath('operators')}".`,
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
  const minutes = endingKeyMinutes(desc);
  if (minutes !== undefined) {
    return {
      refusal: `${pair.accessKey} ends in ${minutes} min, and an action must not lose its key halfway, so the session refuses it. ${oneDayKeyHowto(names)}`,
    };
  }
  return { organizationId };
}

/** Reads of a key the setup minted after the first, and the pause before each: IAM refuses a new key until its policy holds, about a minute. */
const MINTED_KEY_RETRIES = 6;
const MINTED_KEY_PAUSE_MS = 10_000;

/** Describe a key minted in this run, reading it again on a 401 or 403 while it is that new. */
function describeMintedKey(pair: KeyPair): Promise<KeyDescription> {
  return withSpinner('Waiting for the new key to hold', async () => {
    for (let retry = 0; ; retry++) {
      try {
        return await describeKey(pair);
      } catch (error) {
        const status = scwErrorStatus(error);
        if (retry === MINTED_KEY_RETRIES || (status !== 401 && status !== 403)) throw error;
        await sleep(MINTED_KEY_PAUSE_MS);
      }
    }
  });
}

interface Unlocked {
  /** The operator key: it authenticates API calls and every privileged action of the session. */
  accessKey: string;
  secret: string;
  organizationId: string;
}

/** What Scaleway said of a key: the organization it unlocks, or why not, and whether that was a verdict on the key. */
type Judgement = { organizationId: string } | { lines: string[]; refused: boolean; status?: number };

/** Ask Scaleway who bears the key and whether that bearer unlocks the session. */
async function judgeKey(pair: KeyPair, names: AppPrincipalNames): Promise<Judgement> {
  try {
    const desc = operatorKeyMintedThisRun() ? await describeMintedKey(pair) : await describeKey(pair);
    const verdict = await bearerVerdict(desc, pair, names);
    return 'refusal' in verdict ? { lines: [verdict.refusal], refused: true } : verdict;
  } catch (error) {
    if (scwUnanswered(error)) {
      return { lines: [`Could not reach Scaleway: ${errorMessage(error)}`, 'Scaleway did not refuse the key: it never answered.'], refused: false };
    }
    const status = scwErrorStatus(error);
    return { lines: refusalLines({ status, detail: errorMessage(error), names }), refused: true, status };
  }
}

/** How long the wait row of a refused key waits before the key is read again: about as long as a new policy takes to hold. */
const SETTLE_WAIT_MS = 30_000;

type KeyWayOut = 'wait' | 'another' | 'retry' | typeof LEAVE;

/**
 * Ask what to do with a key Scaleway did not take. A refused key is dropped. A 403 may be a policy that has not held yet: waiting comes
 * first. A key Scaleway never answered on is read again.
 */
function keyWaysOut(judged: { refused: boolean; status?: number }): Promise<KeyWayOut> {
  const rows: Array<WayOut<KeyWayOut>> = judged.refused
    ? [
        ...(judged.status === 403
          ? [
              {
                value: 'wait',
                label: 'Wait 30 s and retry',
                description: 'Check this key again in 30 s, without pasting it again.',
              } as const,
            ]
          : []),
        { value: 'another', label: 'Use another operator key', description: 'Paste another key; the action goes on from here.' },
      ]
    : [{ value: 'retry', label: 'Retry', description: 'Check the same key again, once your connection or Scaleway is back.' }];
  const note = judged.refused
    ? judged.status === 403
      ? 'Scaleway refused this key: it is forgotten unless you wait and retry.'
      : undefined
    : keptKeyNote();
  return whatNow([...rows, leaveRow()], note);
}

/**
 * Unlock the session: the operator key, both halves, typed once per run. It is proven by asking IAM who bears it, with the key itself: that
 * names the application or the user and its organization, and needs no right beyond the IAM read the operators hold. A key Scaleway refuses
 * is dropped and another is asked for in place; one it never answered on is kept and read again.
 */
async function unlock(stack: StackRef): Promise<Unlocked> {
  const names = appPrincipalNames(stack.appConfig.appSlug);
  let pair = rememberedOperatorKey();
  for (;;) {
    pair ??= await keyPairPrompt({ label: 'Operator key', howto: `Paste a key of '${names.operator}' that expires today.` });
    const judged = await judgeKey(pair, names);
    if ('organizationId' in judged) {
      rememberOperatorKey(pair);
      return { accessKey: pair.accessKey, secret: pair.secretKey, organizationId: judged.organizationId };
    }
    if (judged.refused) forgetOperatorKey();
    const [first, ...rest] = judged.lines;
    console.error(`${crossMark} ${first}`);
    for (const line of rest) console.error(`  ${pc.dim(line)}`);
    const picked = await keyWaysOut(judged);
    if (picked === LEAVE) return endAction(1, { left: true });
    if (picked === 'wait') await withSpinner('Waiting 30 s for the key to hold', () => sleep(SETTLE_WAIT_MS));
    if (picked === 'another') pair = undefined;
  }
}

/** The operator key a run holds: it ends within the day, writes no IAM, and is kept in memory for the session. */
export interface OperatorKey extends KeyPair {
  organizationId: string;
}

/**
 * The key every privileged action runs on: a one-day key of the operator application, or of a member of the operators group, pasted once
 * per session or minted by a setup's Owner moment, and kept in this process's memory. It holds no IAM write, so nothing is minted from it,
 * and it ends by itself within the day, so nothing is left to revoke when the action ends. An Owner key never runs one, as the buckets
 * admit no Owner; an app without operators gets them from `operators` or its setup, with an Owner API key.
 */
export async function acquireOperatorKey(stack: StackRef): Promise<OperatorKey> {
  const unlocked = await unlock(stack);
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
  console.info(pc.dim(`${why} It takes your Owner key.`));
  return acquireOwnerKey({ names, projectId: stack.projectId, slug: stack.appConfig.slug, mode: stack.environment });
}
