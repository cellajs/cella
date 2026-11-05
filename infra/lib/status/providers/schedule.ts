import { lastScheduledRun } from '../../deploy/job-runs';
import { scheduleEveryMinutes } from '../../deploy/main-job';
import { actionCommand } from '../../operator-actions';
import { check, probed } from '../check';
import type { StatusProvider } from '../types';

/**
 * When the last scheduled run that did not fail started, null when the main job's newest runs hold none, and the environment's cadence in
 * minutes; neither when the environment has no main job yet.
 */
export type ScheduleFacts = { mainJob: false } | { mainJob: true; startedAt: string | null; everyMinutes: number };

/**
 * Whether the main job's schedule runs: a scheduled run that did not fail within twice its cadence and a minute. A schedule that is missing
 * deploys nothing and leaves no failed run, so no other check sees it.
 */
export const scheduleProvider: StatusProvider<ScheduleFacts> = {
  domain: 'schedule',
  async gather(session) {
    if (session.stackState !== 'bootstrapped') return undefined;
    const { mainJob } = await session.scalewayFacts();
    if (mainJob === undefined) return undefined;
    if (mainJob === null) return { mainJob: false };
    const last = lastScheduledRun(mainJob.runs);
    return { mainJob: true, startedAt: last?.created_at ?? null, everyMinutes: scheduleEveryMinutes(session.mode) };
  },
  evaluate(facts, session, now = Date.now()) {
    if (session.stackState !== 'bootstrapped') return [];
    const schedule = check('schedule.last', 'Schedule', 'scaleway');
    return [
      probed(schedule, session.scalewayKeyAvailable, facts, "could not read the main job's runs", (read) => {
        if (!read.mainJob) return schedule.ok('no main job yet');
        const minutes = read.startedAt ? Math.floor((now - Date.parse(read.startedAt)) / 60_000) : undefined;
        if (minutes !== undefined && minutes <= 2 * read.everyMinutes + 1) return schedule.ok(`last scheduled run ${minutes} min ago`);
        const since = minutes === undefined ? 'among its newest runs' : `for ${minutes} min`;
        return schedule.error(`no scheduled run that did not fail ${since}: the schedule is missing from the definition, or its runs fail`, {
          description: `An apply writes the schedule; \`${actionCommand('runs')}\` says when the last scheduled run started`,
          command: actionCommand('apply'),
        });
      }),
    ];
  },
};
