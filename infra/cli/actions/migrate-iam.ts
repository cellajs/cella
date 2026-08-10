import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { confirm, select } from '@inquirer/prompts';
import { syncGithubEnvironment } from '../../lib/github-sync';
import { deriveInfra } from '../../lib/naming';
import { buildProviderEnv, stateKeyOverrideFromEnv } from '../../lib/scaleway/bootstrap-scw-env';
import { principalNames } from '../../lib/scaleway/principals';
import {
  deleteApplicationCascade,
  removeBootstrapDnsGrant,
  resolveOrganizationId,
} from '../../lib/scaleway/scaleway-iam';
import { deployedServices } from '../../lib/services';
import { checkMark, pc, tildeMark, warningMark } from '../../lib/utils/cli-output';
import { writeEnvVar } from '../../lib/utils/env-file';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { resolveApplicationIdByName } from '../../tasks/assert-vm-grants';
import { setupAdminApp } from '../../tasks/setup-admin-app';
import { setupCiKey } from '../../tasks/setup-ci-key';
import { setupServiceApps } from '../../tasks/setup-service-apps';
import { maskedSecret } from '../prompts/masked-secret';
import {
  envOr,
  type InfraContext,
  promptRequiredInput,
  promptStackName,
  pulumiLoginAndSelect,
  resolveVerifiedPassphrase,
} from '../shared';

/**
 * Migrate a pre-v2 stack to the per-service IAM model (REQ-18), or clean up
 * its legacy principals after the first successful v2 deploy. Idempotent: each
 * step reuses existing apps/keys/config, so an interrupted run is re-runnable.
 *
 * Migrate does, in order:
 *  1. admin app (per-mode, with key custody in Secret Manager)
 *  2. per-service + boot apps
 *  3. fresh per-mode CI key WITH the conditioned key-mint rule → GitHub env
 *  4. stack config `infra:iamModel = v2`
 *  5. delete the org-wide `<slug>-bootstrap-dns` residue
 * then prints the two required follow-ups: a bootstrap "Apply infra change"
 * (the new per-service policies are IAM writes CI cannot make) and a deploy.
 * Secret containers move to their per-service folders on that same up
 * (Pulumi updates paths in place; ids, and thus manifests, are unchanged).
 *
 * Cleanup (run AFTER a v2 deploy verified green) deletes the legacy
 * principals: `<slug>-ci-deploy`, `<slug>-vm-reader`, `<slug>-operator`,
 * `<slug>-s3`, and the per-mode `<slug>-<mode>-vm-reader`. Until then they
 * keep the outgoing generation hydrating and signing.
 */
export async function runMigrateIam(context: InfraContext): Promise<void> {
  const { appConfig } = context;
  const mode = context.environment;
  const names = principalNames(appConfig.slug, mode);

  const phase = await select<'migrate' | 'cleanup' | 'back'>({
    message: `Migrate IAM model (${appConfig.slug}-${mode})`,
    loop: false,
    choices: [
      {
        name: 'Migrate to v2',
        value: 'migrate',
        description: 'Create per-mode/per-service principals, rotate the CI key, flip the stack to iamModel=v2.',
      },
      {
        name: 'Clean up legacy principals',
        value: 'cleanup',
        description: 'AFTER a green v2 deploy: delete the legacy ci-deploy/vm-reader/operator/s3 apps.',
      },
      { name: '← Back', value: 'back', description: 'Return without changes.' },
    ],
  });
  if (phase === 'back') return;

  console.info(pc.dim('\nNeeds a bootstrap-grade key (IAMManager + IAMReadOnly + Object Storage).'));
  const accessKey = await envOr('SCW_BOOTSTRAP_ACCESS_KEY', () => promptRequiredInput('Scaleway bootstrap access key'));
  const secretKey = await envOr('SCW_BOOTSTRAP_SECRET_KEY', () =>
    maskedSecret({ message: 'Scaleway bootstrap secret key' }),
  );
  const organizationId = await resolveOrganizationId(secretKey, context.projectId);

  if (phase === 'cleanup') {
    const legacyNames = [
      names.legacy.ciDeploy,
      names.legacy.vmReader,
      names.legacy.operator,
      `${appConfig.slug}-s3`,
      `${appConfig.slug}-${mode}-s3`,
      names.vmReader,
    ];
    console.info(`\nWill delete (when present): ${legacyNames.join(', ')}`);
    if (
      !(await confirm({
        message: 'Proceed? Only do this after a v2 deploy verified green (old generations lose their keys).',
        default: false,
      }))
    )
      return;
    for (const name of legacyNames) {
      try {
        const id = await resolveApplicationIdByName(fetch, secretKey, organizationId, name);
        if (!id) {
          console.info(`  ${tildeMark} ${name}: absent`);
          continue;
        }
        await deleteApplicationCascade({ callerSecretKey: secretKey, organizationId, applicationId: id });
        console.info(`  ${checkMark} deleted ${name}`);
      } catch (error) {
        console.warn(`  ${warningMark} ${name}: ${errorMessage(error)}`);
      }
    }
    console.info(`\n${checkMark} Legacy cleanup done. The next \`pulumi up\` drops their bucket-policy statements.`);
    return;
  }

  // migrate
  const passphrase = await resolveVerifiedPassphrase(context.stackYaml);
  const targetStack = await promptStackName(context);
  const env = buildProviderEnv(infraDir, {
    accessKey,
    secretKey,
    projectId: context.projectId,
    passphrase,
    organizationId,
    ...stateKeyOverrideFromEnv(),
  });

  console.info(`\n→ Admin app (${names.admin})`);
  try {
    const admin = await setupAdminApp({
      callerSecretKey: secretKey,
      projectId: context.projectId,
      slug: appConfig.slug,
      mode,
      region: appConfig.s3.region,
    });
    writeEnvVar(resolve(infraDir, '..', 'backend', '.env'), 'SCW_ADMIN_APPLICATION_ID', admin.applicationId);
    console.info(`  ${checkMark} ${admin.applicationId} (key stored in Secret Manager: admin-key)`);
  } catch (error) {
    console.warn(`  ${warningMark} admin app failed: ${errorMessage(error)} — continuing (re-run to retry)`);
  }

  console.info('\n→ Per-service + boot apps');
  const deployed = deployedServices(appConfig.services, appConfig.singleVM ?? false).map((svc) => svc.slug);
  const apps = await setupServiceApps({
    callerSecretKey: secretKey,
    projectId: context.projectId,
    slug: appConfig.slug,
    mode,
    services: deployed,
  });
  console.info(`  ${checkMark} ${deployed.join(', ')} + boot (${apps.allAppIds.length} apps)`);

  console.info(`\n→ CI key (${names.ciDeploy}) with the conditioned key-mint rule`);
  const ciKey = await setupCiKey({
    callerSecretKey: secretKey,
    projectId: context.projectId,
    slug: appConfig.slug,
    mode,
    dnsZone: deriveInfra(appConfig).dnsZone,
    keyMintAppIds: apps.allAppIds,
  });
  const synced = await syncGithubEnvironment({
    repoRoot: new URL('..', `file://${infraDir}/`).pathname,
    environment: mode,
    ciKey: {
      accessKey: ciKey.accessKey,
      secretKey: ciKey.secretKey,
      projectId: context.projectId,
      organizationId: ciKey.organizationId,
    },
    passphrase,
  });
  console.info(
    `  ${checkMark} minted ${ciKey.accessKey}${synced ? ' → GitHub Environment synced' : ` — ${pc.yellow('GitHub sync failed; update SCW_* secrets manually')}`}`,
  );

  console.info('\n→ Stack config infra:iamModel = v2');
  pulumiLoginAndSelect(infraDir, env, appConfig, targetStack);
  const set = spawnSync('pulumi', ['config', 'set', 'infra:iamModel', 'v2', '--stack', targetStack], {
    cwd: infraDir,
    env,
    stdio: 'inherit',
  });
  if (set.status !== 0) {
    console.warn(
      `  ${warningMark} could not set stack config — set it manually: pulumi config set infra:iamModel v2 --stack ${targetStack}`,
    );
  }

  await removeBootstrapDnsGrant({ callerSecretKey: secretKey, organizationId, slug: appConfig.slug }).catch(
    () => false,
  );

  console.info(
    `\n${checkMark} ${pc.bold('Migration staged.')} Two follow-ups, in order:\n` +
      `  1. ${pc.cyan('pnpm infra → Stack setup → Apply infra change')} ${pc.dim('(bootstrap up: creates the per-service IAM policies + moves secret folders — CI cannot write IAM)')}\n` +
      `  2. ${pc.cyan('deploy (CI or local)')} ${pc.dim('— first v2 deploy mints generation keys and re-rolls VMs onto the handoff flow')}\n` +
      `  then: ${pc.cyan('Migrate IAM model → Clean up legacy principals')} ${pc.dim('(after the deploy is verified green)')}\n` +
      `  ${pc.dim(`Commit the infra config change (Pulumi.${mode}.yaml) so CI sees iamModel=v2.`)}`,
  );
}
