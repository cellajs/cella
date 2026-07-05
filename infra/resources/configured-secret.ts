/**
 * Shared "stack-config secret else generated" value used for every
 * Pulumi-owned credential (DB role passwords, random runtime secrets).
 *
 * `resourceName` is part of the RandomPassword's Pulumi identity — renaming it
 * regenerates the credential on the next `pulumi up`, so callers must keep the
 * names they shipped with.
 */
import type * as pulumi from '@pulumi/pulumi'
import * as random from '@pulumi/random'
import { infraConfig } from '../pulumi-context'

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
