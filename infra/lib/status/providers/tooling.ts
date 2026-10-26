import { installedPulumiVersion, pulumiCliLagWarning, sdkPulumiVersion } from '../../utils/pulumi-version';
import { check, installPulumi } from '../check';
import type { StatusProvider } from '../types';

/** Whether the Pulumi CLI `infra` shells out to is on PATH, and which version answers. */
export interface ToolingFacts {
  pulumi: boolean;
  /** `pulumi version`, when the CLI is present. */
  pulumiVersion?: string;
}

export const toolingProvider: StatusProvider<ToolingFacts> = {
  domain: 'tooling',
  async gather() {
    const pulumiVersion = installedPulumiVersion();
    return { pulumi: pulumiVersion !== undefined, pulumiVersion };
  },
  evaluate(facts) {
    const tooling = facts ?? { pulumi: false };
    const pulumi = check('tooling.pulumi', 'Pulumi CLI');
    // A CLI older than the SDK is a warning, not an error: it still runs, but the main job (which installs the SDK version) and this machine would write state with different engines.
    const lag = tooling.pulumi ? pulumiCliLagWarning(tooling.pulumiVersion, sdkPulumiVersion()) : undefined;
    return [
      !tooling.pulumi
        ? pulumi.error('not found on PATH; every stack operation needs it', installPulumi)
        : lag
          ? pulumi.warn(lag, { description: 'Upgrade the Pulumi CLI', command: 'brew upgrade pulumi' })
          : pulumi.ok(tooling.pulumiVersion ? `installed (${tooling.pulumiVersion})` : 'installed'),
    ];
  },
};
