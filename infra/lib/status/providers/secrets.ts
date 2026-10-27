import { assertSecretsDeliverable, secretsForServices } from '../../../tasks/assert-secrets-deliverable';
import { enabledServices } from '../../services';
import { check, manageSecrets, probed } from '../check';
import type { StatusProvider } from '../types';

/** The required copies with no version, as `name in path`: a machine reading one would stop at hydration. */
export type SecretsFacts = string[];

/** Every required copy the enabled services read, checked one by one as the deploy checks them: a secret set in one folder and not another counts as missing. */
export const secretsProvider: StatusProvider<SecretsFacts> = {
  domain: 'secrets',
  async gather(session) {
    if (!session.scalewayKeyAvailable || !session.secretKey || !session.projectId) return undefined;
    try {
      const enabled = enabledServices(session.appConfig.services).map((service) => service.slug);
      const { offenders } = await assertSecretsDeliverable({
        secretKey: session.secretKey,
        region: session.appConfig.s3.region,
        projectId: session.projectId,
        secrets: secretsForServices(enabled, session.appConfig.slug, session.mode),
        log: () => {},
      });
      return offenders.map((offender) => `${offender.secretName}${offender.path ? ` in ${offender.path}` : ''}`);
    } catch {
      return undefined;
    }
  },
  evaluate(facts, session) {
    const secrets = check('secrets.required', 'Runtime secrets', 'scaleway');
    return [
      probed(secrets, session.scalewayKeyAvailable, facts, 'could not read Secret Manager', (missing) =>
        missing.length === 0
          ? secrets.ok('every required copy holds a value')
          : secrets.missing(`required copies without a value: ${missing.join(', ')}`, manageSecrets),
      ),
    ];
  },
};
