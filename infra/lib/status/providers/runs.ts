import { findJobDefinition, type JobRun, listJobRuns, runEnded } from '../../deploy/job-runs';
import { mainJobOutcome } from '../../deploy/main-job';
import { deriveInfra } from '../../naming';
import { actionCommand } from '../../operator-actions';
import { check, probed } from '../check';
import type { StatusProvider } from '../types';

/** The main job's newest run, or null when the environment has none yet. */
export type RunsFacts = { last: JobRun | null };

/** How the environment's last deploy went: a blocked one owes an apply, a failed one is read in Show runs. */
export const runsProvider: StatusProvider<RunsFacts> = {
  domain: 'runs',
  async gather(session) {
    if (session.stackState !== 'bootstrapped') return undefined;
    if (!session.scalewayKeyAvailable || !session.secretKey || !session.projectId) return undefined;
    try {
      const auth = { secretKey: session.secretKey };
      const { naming, region } = deriveInfra(session.appConfig);
      const definitionId = await findJobDefinition(auth, { region, projectId: session.projectId, name: naming.resource('main') });
      const [last] = definitionId ? await listJobRuns(auth, { region, projectId: session.projectId, definitionId }) : [];
      return { last: last ?? null };
    } catch {
      return undefined;
    }
  },
  evaluate(facts, session) {
    if (session.stackState !== 'bootstrapped') return [];
    const runs = check('runs.last', 'Last deploy', 'scaleway');
    return [
      probed(runs, session.scalewayKeyAvailable, facts, "could not read the main job's runs", ({ last }) => {
        if (!last) return runs.ok('no run yet');
        const sha = last.environment_variables?.TARGET_SHA?.slice(0, 10) ?? '?';
        if (!runEnded(last)) return runs.ok(`${sha} is deploying (${last.state})`);
        const outcome = mainJobOutcome(last);
        if (outcome === 'deployed') return runs.ok(`deployed ${sha}`);
        if (outcome === 'blocked') {
          return runs.warn(`${sha} is blocked: a privileged change is owed`, {
            description: 'Apply it; the apply starts this target again',
            command: actionCommand('apply'),
          });
        }
        return runs.error(`${sha} failed (${last.state})`, { description: 'Read how it ended', command: actionCommand('runs') });
      }),
    ];
  },
};
