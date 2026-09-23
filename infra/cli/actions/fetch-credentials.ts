import {
  assertBootstrapCapable,
  classifyPrincipal,
  describeKey,
  formatKeyLine,
  resolveOperatorIdentity,
} from '../../lib/scaleway/operator-identity';
import { principalNames } from '../../lib/scaleway/principals';
import { resolveOrganizationId } from '../../lib/scaleway/scaleway-iam';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { engineSecretPath } from '../../lib/scaleway/secret-paths';
import { checkMark, pc, warningMark } from '../../lib/utils/cli-output';
import { writeModeEnvValues } from '../../lib/utils/env-files';
import { errorMessage } from '../../lib/utils/errors';
import { ADMIN_KEY_SECRET_NAME } from '../../tasks/setup-admin-app';
import { maskedSecret } from '../prompts/masked-secret';
import { type InfraContext, promptRequiredInput } from '../shared';
import { printRevokeReminder } from './privileged-converge';

/**
 * Put the standing admin key on this machine: read the `admin-key` pair setup custodied in Secret Manager with a bootstrap key, confirm it really
 * belongs to the admin application, and write it to infra/.env.<mode>. The one bootstrap moment a new operator machine needs.
 */
export async function runFetchCredentials(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  console.info(
    pc.dim(
      '\nFetch operator credentials: read the admin application key from Secret Manager with a bootstrap key and write it to infra/.env.<mode>.\n',
    ),
  );
  const identity = resolveOperatorIdentity();
  const bootAccess = identity.bootstrap?.accessKey ?? (await promptRequiredInput('Scaleway bootstrap access key'));
  const bootSecret =
    identity.bootstrap?.secretKey ?? (await maskedSecret({ message: 'Scaleway bootstrap secret key' }));
  const names = principalNames(appConfig.slug, context.environment);

  let organizationId: string;
  try {
    organizationId = await resolveOrganizationId(bootSecret, projectId);
    const { desc, role } = await assertBootstrapCapable({
      pair: { accessKey: bootAccess, secretKey: bootSecret },
      names,
      organizationId,
    });
    console.info(`${pc.dim('Bootstrap key:')} ${formatKeyLine(desc, role)}`);
  } catch (error) {
    console.error(`${warningMark} ${errorMessage(error)}`);
    process.exit(1);
  }

  const secrets = createSecretManagerClient({ secretKey: bootSecret, region: appConfig.s3.region, projectId });
  const container = await secrets.getSecretByName(
    ADMIN_KEY_SECRET_NAME,
    engineSecretPath(appConfig.slug, context.environment),
  );
  if (!container) {
    console.error(
      `${warningMark} No '${ADMIN_KEY_SECRET_NAME}' secret under ${engineSecretPath(appConfig.slug, context.environment)}: run "Rotate keys" once to create the admin application and its key.`,
    );
    process.exit(1);
  }
  let pair: { accessKey: string; secretKey: string };
  try {
    pair = JSON.parse(await secrets.accessLatestValue(container.id)) as { accessKey: string; secretKey: string };
    if (!pair.accessKey || !pair.secretKey) throw new Error('missing accessKey/secretKey');
  } catch (error) {
    console.error(
      `${warningMark} The admin-key secret is not a usable key pair (${errorMessage(error)}); run "Rotate keys".`,
    );
    process.exit(1);
  }

  // Trust but verify: the secret is expected to hold the admin application's key, nothing else goes into the standing slot.
  const desc = await describeKey(pair);
  const role = classifyPrincipal(desc, names);
  if (role !== 'admin') {
    console.error(
      `${warningMark} ${formatKeyLine(desc, role)} is not the admin application's key; refusing to write it.`,
    );
    process.exit(1);
  }
  const written = writeModeEnvValues(context.environment, {
    SCW_ACCESS_KEY: pair.accessKey,
    SCW_SECRET_KEY: pair.secretKey,
  });
  console.info(`${checkMark} ${formatKeyLine(desc, role)}\n  written to ${written} as SCW_ACCESS_KEY / SCW_SECRET_KEY`);
  if (identity.state?.source === 'SCW_STATE_*') {
    console.info(
      `  ${pc.dim('SCW_STATE_ACCESS_KEY / SCW_STATE_SECRET_KEY are no longer needed: remove them from the file.')}`,
    );
  }
  printRevokeReminder();
}
