import { findJobDefinition, type JobDefinitionFacts, type JobRun, listJobRuns, readJobDefinition, runEnded } from '../../deploy/job-runs';
import { mainJobOutcome } from '../../deploy/main-job';
import { deriveInfra } from '../../naming';
import { actionCommand } from '../../operator-actions';
import { check, probed } from '../check';
import type { StatusProvider } from '../types';

/** The main job's newest run and its definition, or null and undefined when the environment has none yet. */
export type RunsFacts = { last: JobRun | null; definition?: JobDefinitionFacts };

/** The values every start of the engine sets: the target and the retry counter. */
const START_VALUES = new Set(['TARGET_SHA', 'RETRY']);

/**
 * What a run was started with beyond the target and the retry counter (D-b): a value the definition does not set, another value for one it
 * sets, or a command of its own. The runner, a rotation, an apply and Start a deploy set the two values only, so anything else is a key
 * holder's own start, which no check inside the job can stop. A run started before the definition's last change ran the command of that time,
 * so its command is not compared. Empty for a run started as the engine starts one.
 */
export function runOverrides(run: JobRun, definition: JobDefinitionFacts): string[] {
  const own: string[] = [];
  for (const [name, value] of Object.entries(run.environment_variables ?? {})) {
    if (START_VALUES.has(name)) continue;
    if (!(name in definition.env)) own.push(`sets ${name}`);
    else if (definition.env[name] !== value) own.push(`sets ${name} to another value`);
  }
  const sameDefinition = !definition.updatedAt || Date.parse(run.created_at ?? '') >= Date.parse(definition.updatedAt);
  if (run.command && definition.command && sameDefinition && run.command !== definition.command) own.push('runs its own command');
  return own;
}

/** How the environment's last deploy went: a blocked one owes an apply or a secret, a failed one is read in Show runs. */
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
      return { last: last ?? null, definition };
    } catch {
      return undefined;
    }
  },
  evaluate(facts, session) {
    if (session.stackState !== 'bootstrapped') return [];
    const runs = check('runs.last', 'Last deploy', 'scaleway');
    return [
      probed(runs, session.scalewayKeyAvailable, facts, "could not read the main job's runs", ({ last, definition }) => {
        if (!last) return runs.ok('no run yet');
        const sha = last.environment_variables?.TARGET_SHA?.slice(0, 10) ?? '?';
        const own = definition ? runOverrides(last, definition) : [];
        if (own.length > 0) {
          return runs.error(`${sha} was started with its own values (${own.join(', ')}): no start of the engine does that`, {
            description: 'Read the run, then rotate the keys that may start one',
            command: actionCommand('runs'),
          });
        }
        if (!runEnded(last)) return runs.ok(`${sha} is deploying (${last.state})`);
        const outcome = mainJobOutcome(last);
        if (outcome === 'deployed') return runs.ok(`deployed ${sha}`);
        if (outcome === 'blocked') {
          return runs.warn(`${sha} is blocked: its record names what is owed, an apply or a secret`, {
            description: 'Read what is owed; the apply, or storing the secret, starts this target again',
            command: actionCommand('runs'),
          });
        }
        return runs.error(`${sha} failed (${last.state})`, { description: 'Read how it ended', command: actionCommand('runs') });
      }),
    ];
  },
};
