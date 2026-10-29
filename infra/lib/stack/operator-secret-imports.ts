import type { RuntimeSecretDefinition } from '../runtime-secrets';
import type { SecretManagerSecret } from '../scaleway/scaleway-secret-manager';
import { secretCopies } from '../scaleway/secret-paths';

const trimSlashes = (path: string) => `/${path.split('/').filter(Boolean).join('/')}`;

/**
 * The `OPERATOR_SECRET_IMPORTS` value for a stack's first `pulumi up`: the operator-value copies whose containers already exist. A
 * teardown keeps them, with their values, and Secret Manager refuses a second container with the same name and path, so a setup of the same
 * environment adopts them. Empty when there is none.
 */
export function operatorSecretImports(
  listed: readonly Pick<SecretManagerSecret, 'id' | 'name' | 'path'>[],
  operatorSecrets: readonly Pick<RuntimeSecretDefinition, 'secretName' | 'services'>[],
  opts: { region: string },
): string {
  return operatorSecrets
    .flatMap((definition) =>
      secretCopies(definition).flatMap(({ service, path }) => {
        const found = listed.find((secret) => secret.name === definition.secretName && trimSlashes(secret.path) === trimSlashes(path));
        return found ? [`${definition.secretName}@${service}=${opts.region}/${found.id}`] : [];
      }),
    )
    .join(',');
}
