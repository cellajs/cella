import { actionLabel } from '../../lib/operator-actions';
import { pc } from '../../lib/utils/cli-output';
import type { InfraContext } from '../shared';
import { operatorKeys } from './operator-unlock';
import { reviewPlan } from './plan';

/** The plan of "Review & apply changes" without its question: for a script, or a look that must never reach an apply. */
export async function runPreview(context: InfraContext): Promise<void> {
  console.info(pc.dim(`\n${actionLabel('preview')}: what an apply would change. Nothing is applied.\n`));
  await reviewPlan(context, (await operatorKeys(context)).key);
  console.info(`\n${pc.dim('A clean "no changes" result means the stack matches the code.')}`);
}
