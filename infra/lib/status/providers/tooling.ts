import { spawnSync } from 'node:child_process';
import { check, installPulumi } from '../check';
import type { StatusProvider } from '../types';

/** Whether the three external tools `infra` shells out to are on PATH. */
export interface ToolingFacts {
  pulumi: boolean;
  dockerBuildx: boolean;
  gh: boolean;
}

/** True when `cmd args` exits 0 (a presence probe). */
export const hasTool = (cmd: string, args: string[]): boolean => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;

export const toolingProvider: StatusProvider<ToolingFacts> = {
  domain: 'tooling',
  async gather() {
    return {
      pulumi: hasTool('pulumi', ['version']),
      dockerBuildx: hasTool('docker', ['buildx', 'version']),
      gh: hasTool('gh', ['auth', 'status']),
    };
  },
  evaluate(facts) {
    const tooling = facts ?? { pulumi: false, dockerBuildx: false, gh: false };
    const pulumi = check('tooling.pulumi', 'Pulumi CLI');
    const docker = check('tooling.docker', 'Docker buildx');
    const gh = check('tooling.gh', 'GitHub CLI');
    return [
      tooling.pulumi
        ? pulumi.ok('installed')
        : pulumi.error('not found on PATH; every stack operation needs it', installPulumi),
      tooling.dockerBuildx
        ? docker.ok('available')
        : docker.warn('not found; local `deploy --build` unavailable (CI builds still work)'),
      tooling.gh
        ? gh.ok('authenticated')
        : gh.warn('not authenticated; Environment secret sync is skipped (set them by hand)'),
    ];
  },
};
