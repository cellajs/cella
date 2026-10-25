import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { DEPLOY_KEY_SECRET_NAME, MAIN_JOB_SCRIPT, mainJobImage, mainJobSecretFolder, rootNodeVersion } from '../lib/deploy/main-job';
import { repositoryUrl } from '../lib/deploy/repository-key';
import { actionCommand } from '../lib/operator-actions';
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { deployFolderPath } from '../lib/scaleway/secret-paths';
import { mode, naming, organizationId, projectId, region } from '../pulumi-context';
import { PASSPHRASE_SECRET_NAME } from '../tasks/passphrase-custody';

// The main job (plan §3.5): one definition per environment, privileged like the rest of what decides who may do what. Its two keys are
// referenced, never copied: the deploy key and the passphrase, both in the engine folder. A run gets its target from the start call.
// The secrets are found with this run's own key, as the provider has no lookup that answers "not there": a stack whose deploy key has no
// copy yet (one made before the main job) gets the definition after its next rotation of keys, and a warning until then.
const folder = mainJobSecretFolder(naming.slug, mode);
const secrets = createSecretManagerClient({ secretKey: process.env.SCW_SECRET_KEY ?? '', region, projectId });
const [deployKey, passphrase] = await Promise.all([
  secrets.getSecretByName(DEPLOY_KEY_SECRET_NAME, folder),
  secrets.getSecretByName(PASSPHRASE_SECRET_NAME, folder),
]);

if (deployKey && passphrase) {
  new scaleway.job.Definition('main-job', {
    name: naming.resource('main'),
    description: 'One deploy of a target per run (plan §3.5); started by the runner, or by the operator by hand',
    region,
    projectId,
    imageUri: mainJobImage(rootNodeVersion()),
    startupCommands: ['bash', '-c', MAIN_JOB_SCRIPT],
    cpuLimit: 2000,
    memoryLimit: 4096,
    localStorageCapacity: 10000,
    timeout: '1h',
    env: {
      MODE: mode,
      REPO: repositoryUrl(),
      REGION: region,
      DEPLOY_FOLDER: deployFolderPath(naming.slug, mode).replace(/\/$/, ''),
      SCW_DEFAULT_PROJECT_ID: projectId,
      SCW_DEFAULT_ORGANIZATION_ID: organizationId,
    },
    secretReferences: [
      { secretId: deployKey.id, secretVersion: 'latest', environment: 'DEPLOY_KEY_JSON' },
      { secretId: passphrase.id, secretVersion: 'latest', environment: 'PULUMI_CONFIG_PASSPHRASE' },
    ],
  });
} else {
  const missing = [deployKey ? '' : DEPLOY_KEY_SECRET_NAME, passphrase ? '' : PASSPHRASE_SECRET_NAME].filter(Boolean).join(' and ');
  pulumi.log.warn(`The main job's definition waits for ${missing} in ${folder}: \`${actionCommand('rotate-keys')}\` writes the deploy key's copy.`);
}
