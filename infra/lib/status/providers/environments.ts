import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENVIRONMENTS_FILE, parseEnvironmentsFile } from '../../deploy/target';
import { errorMessage } from '../../utils/errors';
import { infraDir } from '../../utils/paths';
import { check } from '../check';
import type { StatusProvider } from '../types';

/** This checkout's environments file ('' without one), and the environments whose `infra/Pulumi.<environment>.yaml` exists. */
export type EnvironmentsFacts = { text: string; stacks: string[] };

/**
 * Whether the environments file and the stacks set up agree, the same in every mode: a stack other than production that has no line deploys
 * nothing and still costs, and a line without a stack deploys nowhere. It reads this checkout; the runner reads the file once it is merged.
 */
export const environmentsProvider: StatusProvider<EnvironmentsFacts> = {
  domain: 'environments',
  async gather() {
    const file = join(infraDir, '..', ENVIRONMENTS_FILE);
    const stacks = readdirSync(infraDir).flatMap((name) => /^Pulumi\.([a-z][a-z0-9-]*)\.yaml$/.exec(name)?.[1] ?? []);
    return { text: existsSync(file) ? readFileSync(file, 'utf8') : '', stacks };
  },
  evaluate(facts) {
    const environments = check('environments.lines', 'Environments file');
    if (!facts) return [environments.unknown(`could not read ${ENVIRONMENTS_FILE} or the stack files`)];
    let lines: string[];
    try {
      lines = [...parseEnvironmentsFile(facts.text).keys()];
    } catch (error) {
      return [environments.error(`the runner refuses the whole file: ${errorMessage(error)}`)];
    }
    const findings = [
      ...facts.stacks
        .filter((name) => name !== 'production' && !lines.includes(name))
        .map((name) => `${name} is set up but not deployed: it still costs; add \`${name} branch:main\`, or tear it down`),
      ...lines
        .filter((name) => !facts.stacks.includes(name))
        .map((name) => `${name} has a line but is not set up (no infra/Pulumi.${name}.yaml): set it up, or remove the line`),
    ];
    if (findings.length > 0) return [environments.warn(findings.join('; '))];
    return [environments.ok(`set up and deployed: ${facts.stacks.join(', ') || 'none'}`)];
  },
};
