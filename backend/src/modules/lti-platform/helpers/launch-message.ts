import { appConfig } from 'shared';
import type { LtiToolConfig } from '#/modules/lti-platform/lti-platform-schema';

/** The page that posts a launch's login initiation to the LTI tool, served by the API (`initiateLtiLaunchLogin`). */
export const loginInitiationUrl = `${appConfig.backendUrl}/lti-launches/~initiate-login`;

/** The parts of an LTI registration a launch reads. */
interface LaunchClient {
  ltiToolConfig: LtiToolConfig;
}

/** The message the LTI tool registered for a resource link launch, which may name its own target and custom values. */
const resourceLinkMessage = (config: LtiToolConfig) => config.messages.find(({ type }) => type === 'LtiResourceLinkRequest');

/** Where a resource link launch lands: the target its message registered, else the LTI tool's own. */
export const launchTargetLinkUri = ({ ltiToolConfig }: LaunchClient) =>
  resourceLinkMessage(ltiToolConfig)?.target_link_uri ?? ltiToolConfig.target_link_uri;

/** The `custom` claim: the LTI tool's custom parameters, its resource link message's over them, the resource link's over both. */
export const launchCustom = ({ ltiToolConfig }: LaunchClient, resourceLinkCustom: Record<string, string>): Record<string, string> => ({
  ...ltiToolConfig.custom_parameters,
  ...resourceLinkMessage(ltiToolConfig)?.custom_parameters,
  ...resourceLinkCustom,
});
