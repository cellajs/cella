import { operatorManagedRuntimeSecrets } from '../../runtime-secrets';
import { createSecretManagerClient } from '../../scaleway/scaleway-secret-manager';
import { secretManagerPath } from '../../scaleway/secret-paths';
import { check, manageSecrets, probed } from '../check';
import type { StatusProvider } from '../types';

/** Names of required operator-managed secrets with zero versions. */
export type SecretsFacts = string[];

export const secretsProvider: StatusProvider<SecretsFacts> = {
  domain: 'secrets',
  async gather(session) {
    if (!session.credentialsAvailable || !session.secretKey || !session.projectId) return undefined;
    try {
      const client = createSecretManagerClient({
        secretKey: session.secretKey,
        region: session.appConfig.s3.region,
        projectId: session.projectId,
      });
      const existing = await client.listSecretsUnder(secretManagerPath(session.appConfig.slug, session.mode));
      const versioned = new Set(existing.filter((s) => (s.version_count ?? 0) > 0).map((s) => s.name));
      return operatorManagedRuntimeSecrets
        .filter((s) => s.required && !versioned.has(s.secretName))
        .map((s) => s.secretName);
    } catch {
      return undefined;
    }
  },
  evaluate(facts, session) {
    const secrets = check('secrets.required', 'Runtime secrets', 'scaleway');
    return [
      probed(secrets, session.credentialsAvailable, facts, 'could not read Secret Manager', (missing) =>
        missing.length === 0
          ? secrets.ok('all required secrets set')
          : secrets.missing(`unset required secret(s): ${missing.join(', ')}`, manageSecrets),
      ),
    ];
  },
};
