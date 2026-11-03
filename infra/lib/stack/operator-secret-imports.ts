import type { RuntimeSecretDefinition } from '../runtime-secrets';
import type { SecretManagerSecret } from '../scaleway/scaleway-secret-manager';
import { RUNTIME_FOLDER } from '../scaleway/secret-paths';

const trimSlashes = (path: string) => `/${path.split('/').filter(Boolean).join('/')}`;

/**
 * The `OPERATOR_SECRET_IMPORTS` value for a stack's first `pulumi up`: the operator-value containers that already exist in the runtime
 * folder. A teardown keeps them, with their values, and Secret Manager refuses a second container with the same name and path, so a setup of
 * the same environment adopts them. Empty when there is none.
 */
export function operatorSecretImports(
  listed: readonly Pick<SecretManagerSecret, 'id' | 'name' | 'path'>[],
  operatorSecrets: readonly Pick<RuntimeSecretDefinition, 'secretName'>[],
  opts: { region: string },
): string {
  return operatorSecrets
    .flatMap((definition) => {
      const found = listed.find((secret) => secret.name === definition.secretName && trimSlashes(secret.path) === trimSlashes(RUNTIME_FOLDER));
      return found ? [`${definition.secretName}=${opts.region}/${found.id}`] : [];
    })
    .join(',');
}
