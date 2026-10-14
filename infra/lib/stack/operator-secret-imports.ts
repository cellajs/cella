import type { RuntimeSecretDefinition } from '../runtime-secrets';
import type { SecretManagerSecret } from '../scaleway/scaleway-secret-manager';
import { secretPathFor } from '../scaleway/secret-paths';

const trimSlashes = (path: string) => `/${path.split('/').filter(Boolean).join('/')}`;

/**
 * The `OPERATOR_SECRET_IMPORTS` value for a stack's first `pulumi up`: the operator-value containers that already exist at their own paths. A
 * teardown keeps them, with their values, and Secret Manager refuses a second container with the same name and path, so a setup of the same
 * environment adopts them. Empty when there is none.
 */
export function operatorSecretImports(
  listed: readonly Pick<SecretManagerSecret, 'id' | 'name' | 'path'>[],
  operatorSecrets: readonly Pick<RuntimeSecretDefinition, 'secretName' | 'services'>[],
  opts: { slug: string; mode: string; region: string },
): string {
  return operatorSecrets
    .flatMap((definition) => {
      const path = trimSlashes(secretPathFor(definition, opts.slug, opts.mode));
      const found = listed.find((secret) => secret.name === definition.secretName && trimSlashes(secret.path) === path);
      return found ? [`${definition.secretName}=${opts.region}/${found.id}`] : [];
    })
    .join(',');
}
