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

/**
 * The distinct origins an LTI tool's launches go to: its login initiation, redirect and target addresses. An admin
 * approves them, and a launch page posts to them alone.
 */
export const launchOrigins = ({
  initiateLoginUri,
  redirectUris,
  ltiToolConfig,
}: LaunchClient & { initiateLoginUri: string; redirectUris: string[] }) => {
  const targets = ltiToolConfig.messages.flatMap(({ target_link_uri }) => target_link_uri ?? []);
  const addresses = [initiateLoginUri, ...redirectUris, ltiToolConfig.target_link_uri, ...targets];
  return [...new Set(addresses.map((address) => new URL(address).origin))];
};

/** The `custom` claim: the LTI tool's custom parameters, its resource link message's over them, the resource link's over both. */
export const launchCustom = ({ ltiToolConfig }: LaunchClient, resourceLinkCustom: Record<string, string>): Record<string, string> => ({
  ...ltiToolConfig.custom_parameters,
  ...resourceLinkMessage(ltiToolConfig)?.custom_parameters,
  ...resourceLinkCustom,
});
