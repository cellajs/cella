import { runtimeEnvEntries } from '../../runtime-secrets';
import { createSecretManagerClient } from '../../scaleway/scaleway-secret-manager';
import { RUNTIME_FOLDER } from '../../scaleway/secret-paths';
import { carriedServices, deployedServices } from '../../services';
import { check, manageSecrets, probed } from '../check';
import type { StatusProvider } from '../types';

/** The required runtime values with no version, by container name: a deploy would end blocked composing an env file that needs one. */
export type SecretsFacts = string[];

/** Every value a machine's env file needs, read from the runtime folder's metadata as the deploy's compose step checks it. */
export const secretsProvider: StatusProvider<SecretsFacts> = {
  domain: 'secrets',
  async gather(session) {
    if (!session.scalewayKeyAvailable || !session.secretKey || !session.projectId) return undefined;
    try {
      const { services, singleVM } = session.appConfig;
      const client = createSecretManagerClient({ secretKey: session.secretKey, region: session.appConfig.s3.region, projectId: session.projectId });
      const versioned = new Set((await client.listSecretsUnder(RUNTIME_FOLDER)).filter((s) => (s.version_count ?? 0) > 0).map((s) => s.name));
      const required = deployedServices(services, singleVM).flatMap((machine) =>
        runtimeEnvEntries(carriedServices(services, singleVM, machine)).filter((entry) => entry.required),
      );
      return [...new Set(required.map((entry) => entry.secretName))].filter((name) => !versioned.has(name));
    } catch {
      return undefined;
    }
  },
  evaluate(facts, session) {
    const secrets = check('secrets.required', 'Runtime secrets', 'scaleway');
    return [
      probed(secrets, session.scalewayKeyAvailable, facts, 'could not read Secret Manager', (missing) =>
        missing.length === 0
          ? secrets.ok('every required value is set')
          : secrets.missing(`required values not set: ${missing.join(', ')}`, manageSecrets),
      ),
    ];
  },
};
