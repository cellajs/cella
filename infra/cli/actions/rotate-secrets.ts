import { deriveInfra } from '../../lib/naming';
import { actionLabel } from '../../lib/operator-actions';
import {
  databaseRuntimeSecrets,
  generatedRuntimeSecrets,
  protectsStoredData,
  type RuntimeSecretDefinition,
  runtimeSecrets,
} from '../../lib/runtime-secrets';
import { type KeyPair, resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { stateKeyOf } from '../../lib/scaleway/s3-client';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { controlActor, makeControlClient, readRotations, recordRotation } from '../../lib/stack/control-store';
import { checkMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { ensureDatabaseForStack } from '../../tasks/ensure-database';
import { ensureSecrets } from '../../tasks/ensure-secrets';
import { shortDate } from '../../tasks/manage-runtime-secrets';
import { rememberedOperatorKey } from '../session';
import {
  acquireStackLockOrExit,
  confirmOrDefault,
  endsAction,
  type InfraContext,
  pointTo,
  pulumiLoginAndSelect,
  pulumiLoginUrl,
  stackNameFor,
} from '../shared';
import { acquireAdmittedOperatorKey } from './operator-apply';
import { redeployAfterRotation } from './start-deploy';

/**
 * The last rotation of the values infra makes, read with `key`: `Oct 6 by you`, null before the first, undefined when the record cannot be
 * read. The date is a courtesy: a key the control bucket refuses leaves it out.
 */
export async function lastSecretsRotation(context: InfraContext, key: KeyPair): Promise<string | null | undefined> {
  try {
    const state = stateKeyOf(key, context.projectId);
    const s3 = await makeControlClient(context.appConfig.s3.region, state.accessKey, state.secretKey);
    const { rotations } = await readRotations(s3, deriveInfra(context.appConfig).naming.bootDiagBucket, stackNameFor(context));
    if (!rotations.secrets) return null;
    const { at, by } = rotations.secrets;
    return `${shortDate(at)} by ${by === controlActor() ? 'you' : by.replace(/^operator:/, '')}`;
  } catch {
    return undefined;
  }
}

/** `names` joined by commas, in lines of at most `width` characters. */
function wrapNames(names: readonly string[], width = 60): string[] {
  const lines: string[][] = [];
  for (const name of names) {
    const line = lines.at(-1);
    if (line && [...line, name].join(', ').length < width) line.push(name);
    else lines.push([name]);
  }
  return lines.map((line, index) => `${line.join(', ')}${index < lines.length - 1 ? ',' : ''}`);
}

/** What a rotation changes and keeps, by env var, under dim headings. */
function rotationPlan(definitions: readonly RuntimeSecretDefinition[] = runtimeSecrets): string[] {
  const generated = generatedRuntimeSecrets(definitions);
  const rotated = generated.filter((definition) => !definition.derivedFrom && definition.rotatable === true);
  const follows = generated.filter((definition) => rotated.some((source) => source.id === definition.derivedFrom?.secretId));
  const sections: Array<[string, RuntimeSecretDefinition[]]> = [
    ['Passwords', databaseRuntimeSecrets(definitions)],
    ['Values', rotated],
    ['Follows', follows],
    ['Kept', definitions.filter(protectsStoredData)],
  ];
  return sections
    .filter(([, members]) => members.length > 0)
    .flatMap(([heading, members]) =>
      wrapNames(members.map((definition) => definition.envVar)).map((line, index) => `  ${pc.dim((index === 0 ? heading : '').padEnd(10))}  ${line}`),
    );
}

/**
 * Rotate the secrets the engine checks, on the operator key: a fresh password for every database role (set on the live role through the
 * database API) and a fresh value for every rotatable generated secret, in the runtime folder. A key that protects stored data is
 * not rotatable here (lib/runtime-secrets.ts). The rotation is recorded beside the live record, and its counter makes the deploys it starts
 * at its end (the live release again, then the target) replace every machine. Third-party keys are pasted anew in "Env vars & secrets".
 * @returns Whether it rotated: false when the operator declined.
 */
export async function runRotateSecrets(context: InfraContext): Promise<boolean> {
  const { appConfig, projectId } = context;
  const reader = resolveOperatorIdentity().observer ?? rememberedOperatorKey();
  const last = reader ? await lastSecretsRotation(context, reader) : undefined;
  console.info(`\n${pc.bold(actionLabel('rotate-secrets'))}`);
  if (last !== undefined) console.info(pc.dim(last === null ? 'Never rotated.' : `Last rotation ${last}.`));
  console.info();
  for (const line of rotationPlan()) console.info(line);
  console.info(`  ${pc.dim('Then'.padEnd(10))}  a redeploy replaces every machine\n`);
  console.warn(
    `${warningMark} The running machines keep the old values until that deploy replaces them, and the database refuses the new connections they open with the old passwords.`,
  );
  if (!(await confirmOrDefault({ message: `Rotate the secrets of ${context.environment}?`, default: false }))) return false;

  const operator = await acquireAdmittedOperatorKey(context);
  const stack = stackNameFor(context);
  const env = buildProviderEnv(infraDir, {
    ...operator,
    projectId,
    stateBackendUrl: pulumiLoginUrl(appConfig),
    organizationId: operator.organizationId,
  });
  pulumiLoginAndSelect(infraDir, env, appConfig, stack);

  const state = stateKeyOf(operator, projectId);
  const lock = await acquireStackLockOrExit({ appConfig, ...state, stack, operation: 'rotate-secrets' });
  try {
    const log = (message: string) => console.info(pc.dim(message));
    await ensureDatabaseForStack({
      env,
      stack,
      region: appConfig.s3.region,
      projectId,
      secretKey: operator.secretKey,
      rotate: true,
      log,
    });
    const client = createSecretManagerClient({ secretKey: operator.secretKey, region: appConfig.s3.region, projectId });
    const rotated = await ensureSecrets({ client, rotate: true, log });
    const s3 = await makeControlClient(appConfig.s3.region, state.accessKey, state.secretKey);
    const rotations = await recordRotation({ s3, bucket: deriveInfra(appConfig).naming.bootDiagBucket, stack, kind: 'secrets', by: controlActor() });
    console.info(
      `\n${checkMark} Database role passwords and ${rotated.length} generated secret(s) rotated; rotation ${rotations.counter} recorded. Keys that protect stored data were left as they are.`,
    );
    console.info(`  Third-party keys are pasted anew in "${actionLabel('env')}".`);
  } finally {
    await lock.release();
  }
  await redeployAfterRotation(context, operator).catch((error) => {
    if (endsAction(error)) throw error;
    console.warn(`${warningMark} Could not start the deploy (${errorMessage(error)}): ${pointTo('deploy')} does.`);
  });
  return true;
}
