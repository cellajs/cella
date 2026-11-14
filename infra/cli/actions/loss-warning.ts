import { actionLabel, type OperatorActionId } from '../../lib/operator-actions';
import type { Environment } from '../../lib/stack/bootstrap-stack-state';
import { crossMark, pc } from '../../lib/utils/cli-output';

/** The environment's name as the header shows it: production bold red, staging cyan. */
export function environmentName(environment: Environment): string {
  return environment === 'production' ? pc.bold(pc.red(environment)) : pc.cyan(environment);
}

/** The first screen of an action that deletes data, printed before any key or typed confirmation: its title, then what is lost and what is kept. */
export function printLossWarning(action: OperatorActionId, environment: Environment, lines: readonly string[]): void {
  console.info(`\n${pc.bold(actionLabel(action))}${pc.dim(' · ')}${environmentName(environment)}\n`);
  console.info(`${lines.map((line, index) => `${index === 0 ? crossMark : ' '} ${line}`).join('\n')}\n`);
}
