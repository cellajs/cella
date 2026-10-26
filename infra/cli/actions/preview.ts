import { actionLabel } from '../../lib/operator-actions';
import { pc } from '../../lib/utils/cli-output';
import type { InfraContext } from '../shared';
import { operatorKeys } from './operator-unlock';
import { reviewPlan } from './plan';

/** The plan of "Review & apply changes" without its question: for a script, or a look that must never reach an apply. */
export async function runPreview(context: InfraContext): Promise<void> {
  console.info(pc.dim(`\n${actionLabel('preview')}: \`pulumi preview\` with your operator key. No changes are made.\n`));
  await reviewPlan(context, (await operatorKeys(context)).key);
}
