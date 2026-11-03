import { commandOf, findJobDefinition, type JobDefinitionFacts, type JobRun, listJobRuns, readJobDefinition, runEnded } from '../../deploy/job-runs';
import { mainJobOutcome } from '../../deploy/main-job';
import { type Rewrite, rewriteNote } from '../../deploy/run-record';
import { bucketRunStore } from '../../deploy/run-store';
import { deriveInfra } from '../../naming';
import { actionCommand } from '../../operator-actions';
import { makeS3Client, projectAccessKey } from '../../scaleway/s3-client';
import { errorMessage } from '../../utils/errors';
import { check, probed } from '../check';
import type { ProbeSession, StatusProvider } from '../types';

/**
 * The main job's newest run and its definition, or null and undefined when the environment has none yet, and the newest record as read by
 * its first version: its rewrite when a version broke the chain, `denied` until an apply lets the observer read versions, or the error
 * that stopped the read.
 */
export type RunsFacts = {
  last: JobRun | null;
  definition?: JobDefinitionFacts;
  record?: { run: string; rewrite?: Rewrite } | { denied: true } | { error: string };
};

/** True for the bucket refusing the key: the policy an apply writes admits the observer's version reads. */
function accessDenied(error: unknown): boolean {
  const { name, $metadata } = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return name === 'AccessDenied' || $metadata?.httpStatusCode === 403;
}

/** The newest record read on the session's key, or why it was not; undefined without a key or before the first record. */
async function newestRecord(session: ProbeSession): Promise<RunsFacts['record']> {
  if (!session.accessKey || !session.secretKey || !session.projectId) return undefined;
  try {
    const { naming } = deriveInfra(session.appConfig);
    const s3 = await makeS3Client(session.appConfig.s3.region, projectAccessKey(session.accessKey, session.projectId), session.secretKey);
    const store = bucketRunStore(s3, naming.bootDiagBucket);
    const [run] = await store.listRuns(1);
    if (!run) return undefined;
    const reading = await store.readRecord(run);
    return { run, ...(reading?.rewrite ? { rewrite: reading.rewrite } : {}) };
  } catch (error) {
    return accessDenied(error) ? { denied: true } : { error: errorMessage(error) };
  }
}

/** The values every start of the engine sets: the target and the retry counter. */
const START_VALUES = new Set(['TARGET_SHA', 'RETRY']);

/**
 * What a run was started with beyond the target and the retry counter (D-b): a value the definition does not set, another value for one it
 * sets, or a startup command or arguments of its own. The runner, a rotation, an apply and Start a deploy set the two values only, so anything
 * else is a key holder's own start, which no check inside the job can stop. A run started before the definition's last change ran the values
 * and command of that time, a key the apply removed included, so nothing is compared for it. Empty for a run started as the engine starts one.
 */
export function runOverrides(run: JobRun, definition: JobDefinitionFacts): string[] {
  const sameDefinition = !definition.updatedAt || Date.parse(run.created_at ?? '') >= Date.parse(definition.updatedAt);
  if (!sameDefinition) return [];
  const own: string[] = [];
  for (const [name, value] of Object.entries(run.environment_variables ?? {})) {
    if (START_VALUES.has(name)) continue;
    if (!(name in definition.env)) own.push(`sets ${name}`);
    else if (definition.env[name] !== value) own.push(`sets ${name} to another value`);
  }
  const command = commandOf(run);
  if (command && definition.command && command !== definition.command) own.push('runs its own command');
  return own;
}

/** How the environment's last deploy went: a blocked one owes an identity update, an apply or a secret, a failed one is read in Show runs. */
export const runsProvider: StatusProvider<RunsFacts> = {
  domain: 'runs',
  async gather(session) {
    if (session.stackState !== 'bootstrapped') return undefined;
    if (!session.scalewayKeyAvailable || !session.secretKey || !session.projectId) return undefined;
    try {
      const auth = { secretKey: session.secretKey };
      const { naming, region } = deriveInfra(session.appConfig);
      const definitionId = await findJobDefinition(auth, { region, projectId: session.projectId, name: naming.resource('main') });
      if (!definitionId) return { last: null };
      const [[last], definition] = await Promise.all([
        listJobRuns(auth, { region, projectId: session.projectId, definitionId }),
        readJobDefinition(auth, { region, definitionId }),
      ]);
      const record = await newestRecord(session);
      return { last: last ?? null, definition, ...(record ? { record } : {}) };
    } catch {
      return undefined;
    }
  },
  evaluate(facts, session) {
    if (session.stackState !== 'bootstrapped') return [];
    const runs = check('runs.last', 'Last deploy', 'scaleway');
    return [
      probed(runs, session.scalewayKeyAvailable, facts, "could not read the main job's runs", ({ last, definition, record }) => {
        if (!last) return runs.ok('no run yet');
        const sha = last.environment_variables?.TARGET_SHA?.slice(0, 10) ?? '?';
        const own = definition ? runOverrides(last, definition) : [];
        if (own.length > 0) {
          return runs.error(`${sha} was started with its own values (${own.join(', ')}): no start of the engine does that`, {
            description: 'Read the run, then rotate the keys that may start one',
            command: actionCommand('runs'),
          });
        }
        if (record && 'rewrite' in record && record.rewrite) {
          return runs.error(`the record of run ${record.run} was ${rewriteNote(record.rewrite)}: only a key that may write the bucket does that`, {
            description: 'Read the run as it stood, then rotate the keys',
            command: actionCommand('runs'),
          });
        }
        if (!runEnded(last)) return runs.ok(`${sha} is deploying (${last.state})`);
        const outcome = mainJobOutcome(last);
        if (outcome === 'deployed') {
          if (record && 'denied' in record) {
            return runs.warn(`deployed ${sha}; its record was not read, as the bucket admits no version read by the observer yet`, {
              description: 'Review & apply changes writes the bucket policy that does',
              command: actionCommand('apply'),
            });
          }
          if (record && 'error' in record) {
            return runs.warn(`deployed ${sha}; its record could not be read (${record.error})`, {
              description: 'Read the run',
              command: actionCommand('runs'),
            });
          }
          return runs.ok(`deployed ${sha}`);
        }
        if (outcome === 'blocked') {
          return runs.warn(`${sha} is blocked: its record names what is owed, an identity update, an apply or a secret`, {
            description: 'Read what is owed; the apply or storing the secret starts this target again, start-deploy after an identity update',
            command: actionCommand('runs'),
          });
        }
        return runs.error(`${sha} failed (${last.state})`, { description: 'Read how it ended', command: actionCommand('runs') });
      }),
    ];
  },
};
