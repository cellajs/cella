import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { stateKeyOf } from '../../lib/scaleway/s3-client';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { controlActor, makeControlClient, stateBucket } from '../../lib/stack/control-store';
import { checkMark, pc, warningMark } from '../../lib/utils/cli-output';
import { infraDir } from '../../lib/utils/paths';
import { ensureDatabaseForStack } from '../../tasks/ensure-database';
import { ensureSecrets } from '../../tasks/ensure-secrets';
import { recordRotation } from '../../tasks/record-rotation';
import {
  acquireStackLockOrExit,
  confirmOrDefault,
  type InfraContext,
  pulumiLoginAndSelect,
  resolveVerifiedPassphrase,
  stackNameFor,
} from '../shared';
import { admitOperatorOrExit } from './operator-apply';
import { acquirePrivilegedKey } from './operator-unlock';

/**
 * Rotate the secrets the engine checks, on the operator key: a fresh password for every database role (set on the live role through the
 * database API) and a fresh value for every rotatable generated secret, every consumer's copy rewritten. A key that protects stored data is
 * not rotatable here (lib/runtime-secrets.ts). The rotation is recorded in the control object,
 * and its counter makes the next deploy replace every machine. Third-party keys are pasted anew in "Manage runtime secrets"; the passphrase
 * has its own action.
 */
export async function runRotateSecrets(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  console.info(
    pc.dim(`\n${actionLabel('rotate-secrets')}: fresh database role passwords and generated values, then the next deploy replaces every machine.\n`),
  );
  console.warn(
    `${warningMark} The running machines keep the old values until the next deploy replaces them, and the database refuses the new connections they open with the old passwords: deploy right after.`,
  );
  if (!(await confirmOrDefault({ message: `Rotate the secrets of ${context.environment}?`, default: false }))) return;

  const operator = await acquirePrivilegedKey(context);
  const passphrase = await resolveVerifiedPassphrase(context.stackYaml);
  const stack = stackNameFor(context);
  await admitOperatorOrExit(context, { ...operator, passphrase, stack });
  const env = buildProviderEnv(infraDir, { ...operator, projectId, passphrase, organizationId: operator.organizationId });
  pulumiLoginAndSelect(infraDir, env, appConfig, stack);

  const state = stateKeyOf(operator, projectId);
  const lock = await acquireStackLockOrExit({ appConfig, ...state, stack, operation: 'rotate-secrets' });
  try {
    const log = (message: string) => console.info(pc.dim(message));
    await ensureDatabaseForStack({
      env,
      stack,
      slug: appConfig.slug,
      mode: context.environment,
      region: appConfig.s3.region,
      projectId,
      secretKey: operator.secretKey,
      rotate: true,
      log,
    });
    const client = createSecretManagerClient({ secretKey: operator.secretKey, region: appConfig.s3.region, projectId });
    const rotated = await ensureSecrets({ client, slug: appConfig.slug, mode: context.environment, rotate: true, log });
    const s3 = await makeControlClient(appConfig.s3.region, state.accessKey, state.secretKey);
    const rotations = await recordRotation({ s3, bucket: stateBucket(appConfig.slug), stack, kind: 'secrets', by: controlActor() });
    console.info(
      `\n${checkMark} Database role passwords and ${rotated.length} generated secret(s) rotated; rotation ${rotations.counter} recorded. Keys that protect stored data were left as they are.`,
    );
    console.info(
      `  ${pc.bold('Deploy now')}: every machine is replaced. Third-party keys are pasted anew in "${actionLabel('secrets')}", the passphrase in "${actionLabel('rotate-passphrase')}" (\`${actionCommand('rotate-passphrase')}\`).`,
    );
  } finally {
    await lock.release();
  }
}
