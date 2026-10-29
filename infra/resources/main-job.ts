import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { declaredMainJob, rootNodeVersion } from '../lib/deploy/main-job';
import { repositoryUrl } from '../lib/deploy/repository-key';
import { actionCommand } from '../lib/operator-actions';
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { mode, naming, organizationId, projectId, region } from '../pulumi-context';

// The main job (plan §3.5): one definition per environment, privileged like the rest of what decides who may do what. Its keys are
// referenced, never copied: the deploy key and the passphrase, both in the engine folder. A run gets its target from the start call.
// The secrets are found with this run's own key, as the provider has no lookup that answers "not there": a stack whose deploy key has no
// copy yet (one made before the main job) gets the definition after its next rotation of keys, and a warning until then.
const declared = declaredMainJob({
  mode,
  projectId,
  organizationId,
  region,
  repository: repositoryUrl(),
  nodeVersion: rootNodeVersion(),
});
const secrets = createSecretManagerClient({ secretKey: process.env.SCW_SECRET_KEY ?? '', region, projectId });
const references = await Promise.all(
  Object.entries(declared.secretReferences).map(async ([environment, { name, optional }]) => ({
    environment,
    name,
    optional,
    secret: await secrets.getSecretByName(name, declared.secretFolder),
  })),
);
const missing = references.filter((reference) => !reference.optional && !reference.secret).map((reference) => reference.name);

if (missing.length === 0) {
  new scaleway.job.Definition('main-job', {
    name: naming.resource('main'),
    description: 'One deploy of a target per run (plan §3.5); started by the runner, or by the operator by hand',
    region,
    projectId,
    imageUri: declared.imageUri,
    startupCommands: declared.startupCommands,
    cpuLimit: 2000,
    memoryLimit: 4096,
    localStorageCapacity: 10000,
    timeout: '1h',
    env: declared.env,
    secretReferences: references.flatMap(({ environment, optional, secret }) =>
      secret && (!optional || secret.version_count) ? [{ secretId: secret.id, secretVersion: 'latest', environment }] : [],
    ),
  });
} else {
  pulumi.log.warn(
    `The main job's definition waits for ${missing.join(' and ')} in ${declared.secretFolder}: \`${actionCommand('rotate-keys')}\` writes the deploy key's copy.`,
  );
}
