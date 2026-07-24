import * as pulumi from '@pulumi/pulumi'
import * as random from '@pulumi/random'

// Stack config for operator-provided secret values (`infra:<key>`).
const infraConfig = new pulumi.Config('infra')

/** A secret value from stack config, or a generated URL-safe random one. */
export function configuredOrRandomSecret(configKey: string, resourceName: string): pulumi.Output<string> {
  const configured = infraConfig.getSecret(configKey)
  if (configured) return configured
  return new random.RandomPassword(resourceName, {
    length: 32,
    special: true,
    overrideSpecial: '-_.~', // URL-safe special chars (RFC 3986 unreserved)
    minLower: 2,
    minUpper: 2,
    minNumeric: 2,
    minSpecial: 2,
  }).result
}
