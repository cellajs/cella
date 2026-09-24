import {
  classifyPrincipal,
  describeKey,
  formatKeyLine,
  resolveOperatorIdentity,
} from '../../lib/scaleway/operator-identity';
import { principalNames } from '../../lib/scaleway/principals';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { engineSecretPath } from '../../lib/scaleway/secret-paths';
import { checkMark, pc, warningMark } from '../../lib/utils/cli-output';
import { LEGACY_ADMIN_KEY_NAMES, writeModeEnvValues } from '../../lib/utils/env-files';
import { errorMessage } from '../../lib/utils/errors';
import { ADMIN_KEY_SECRET_NAME } from '../../tasks/setup-admin-app';
import type { InfraContext } from '../shared';
import { acquireOwnerKey, printRevokeReminder } from './owner-key';

/**
 * Put the admin application key on this machine: read the `admin-key` pair setup custodied in Secret Manager with the Owner API key, confirm it
 * really belongs to the admin application, and write it to infra/.env.<mode> as SCW_ADMIN_ACCESS_KEY / SCW_ADMIN_SECRET_KEY. The one privileged
 * moment a new operator machine needs.
 */
export async function runFetchAdminKey(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  console.info(
    pc.dim(
      '\nFetch admin application key: read it from Secret Manager with your Owner API key and write it to infra/.env.<mode>.\n',
    ),
  );
  const names = principalNames(appConfig.slug, context.environment);
  const ownerKey = await acquireOwnerKey({
    identity: resolveOperatorIdentity(),
    names,
    projectId,
    slug: appConfig.slug,
    mode: context.environment,
  });

  const secrets = createSecretManagerClient({
    secretKey: ownerKey.secretKey,
    region: appConfig.s3.region,
    projectId,
  });
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

  // Trust but verify: the secret is expected to hold the admin application's key, nothing else goes into SCW_ADMIN_*.
  const desc = await describeKey(pair);
  const role = classifyPrincipal(desc, names);
  if (role !== 'admin') {
    console.error(
      `${warningMark} ${formatKeyLine(desc, role)} is not the admin application's key; refusing to write it.`,
    );
    process.exit(1);
  }
  const written = writeModeEnvValues(
    context.environment,
    { SCW_ADMIN_ACCESS_KEY: pair.accessKey, SCW_ADMIN_SECRET_KEY: pair.secretKey },
    { remove: LEGACY_ADMIN_KEY_NAMES },
  );
  console.info(
    `${checkMark} ${formatKeyLine(desc, role)}\n  written to ${written.path} as SCW_ADMIN_ACCESS_KEY / SCW_ADMIN_SECRET_KEY`,
  );
  if (written.removed.length > 0) {
    console.info(`  ${pc.dim(`Removed the superseded ${written.removed.join(', ')} from the file.`)}`);
  }
  await ownerKey.release();
  if (ownerKey.pasted) printRevokeReminder();
}
