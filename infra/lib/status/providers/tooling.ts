import { spawnSync } from 'node:child_process';
import { installedPulumiVersion, pulumiCliLagWarning, sdkPulumiVersion } from '../../utils/pulumi-version';
import { check, installPulumi } from '../check';
import type { StatusProvider } from '../types';

/** Whether the three external tools `infra` shells out to are on PATH, and which Pulumi CLI version answers. */
export interface ToolingFacts {
  pulumi: boolean;
  /** `pulumi version`, when the CLI is present. */
  pulumiVersion?: string;
  dockerBuildx: boolean;
  gh: boolean;
}

/** True when `cmd args` exits 0 (a presence probe). */
export const hasTool = (cmd: string, args: string[]): boolean => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;

export const toolingProvider: StatusProvider<ToolingFacts> = {
  domain: 'tooling',
  async gather() {
    const pulumiVersion = installedPulumiVersion();
    return {
      pulumi: pulumiVersion !== undefined,
      pulumiVersion,
      dockerBuildx: hasTool('docker', ['buildx', 'version']),
      gh: hasTool('gh', ['auth', 'status']),
    };
  },
  evaluate(facts) {
    const tooling = facts ?? { pulumi: false, dockerBuildx: false, gh: false };
    const pulumi = check('tooling.pulumi', 'Pulumi CLI');
    const docker = check('tooling.docker', 'Docker buildx');
    const gh = check('tooling.gh', 'GitHub CLI');
    // A CLI older than the SDK is a warning, not an error: it still runs, but CI (which installs the SDK version) and this machine would write state with different engines.
    const lag = tooling.pulumi ? pulumiCliLagWarning(tooling.pulumiVersion, sdkPulumiVersion()) : undefined;
    return [
      !tooling.pulumi
        ? pulumi.error('not found on PATH; every stack operation needs it', installPulumi)
        : lag
          ? pulumi.warn(lag, { description: 'Upgrade the Pulumi CLI', command: 'brew upgrade pulumi' })
          : pulumi.ok(tooling.pulumiVersion ? `installed (${tooling.pulumiVersion})` : 'installed'),
      tooling.dockerBuildx
        ? docker.ok('available')
        : docker.warn('not found; local `deploy --build` unavailable (CI builds still work)'),
      tooling.gh
        ? gh.ok('authenticated')
        : gh.warn('not authenticated; Environment secret sync is skipped (set them by hand)'),
    ];
  },
};
