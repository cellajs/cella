import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { engineImageRef, engineImageRepository, readAppliedEngine } from '../lib/deploy/applied-engine';
import { declaredMainJob } from '../lib/deploy/main-job';
import { actionCommand } from '../lib/operator-actions';
import { projectAccessKey } from '../lib/scaleway/s3-client';
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { makeControlClient } from '../lib/stack/control-store';
import { mode, naming, organizationId, projectId, region } from '../pulumi-context';

/**
 * The engine image the definition runs, by digest: the one this apply built and pushed (`INFRA_ENGINE_IMAGE`, set by Review & apply
 * changes and the setup), else the one the last apply recorded in `applied.json`, so an apply that publishes no engine keeps it. None
 * before the first publish.
 */
async function engineImage(): Promise<string | undefined> {
  if (process.env.INFRA_ENGINE_IMAGE) return process.env.INFRA_ENGINE_IMAGE;
  const accessKey = process.env.SCW_ACCESS_KEY ?? '';
  const s3 = await makeControlClient(region, projectAccessKey(accessKey, projectId), process.env.SCW_SECRET_KEY ?? '');
  // A missing bucket or object reads as none; any other failure stops the plan, which would otherwise delete the definition.
  const applied = await readAppliedEngine(s3, naming.bootDiagBucket, mode);
  return applied ? engineImageRef(engineImageRepository(region, naming.registryNamespace), applied.imageDigest) : undefined;
}

const image = await engineImage();
const declared = image ? declaredMainJob({ projectId, organizationId, image }) : undefined;
// Its key is referenced, never copied, and found with this run's own key, as the provider has no lookup that answers "not there": a stack
// whose deploy key has no copy yet gets the definition after its next rotation of keys, and a warning until then.
const secrets = createSecretManagerClient({ secretKey: process.env.SCW_SECRET_KEY ?? '', region, projectId });
const references = declared
  ? await Promise.all(
      Object.entries(declared.secretReferences).map(async ([environment, { name, optional }]) => ({
        environment,
        name,
        optional,
        secret: await secrets.getSecretByName(name, declared.secretFolder),
      })),
    )
  : [];
const missing = references.filter((reference) => !reference.optional && !reference.secret).map((reference) => reference.name);

if (!declared) {
  pulumi.log.warn(`The main job's definition waits for its engine image: \`${actionCommand('apply')}\` builds and publishes it.`);
} else if (missing.length > 0) {
  pulumi.log.warn(
    `The main job's definition waits for ${missing.join(' and ')} in ${declared.secretFolder}: \`${actionCommand('rotate-keys')}\` writes the deploy key's copy.`,
  );
} else {
  new scaleway.job.Definition('main-job', {
    name: naming.resource('main'),
    description: 'One deploy of a target per run (plan §3.5), on the engine image the last apply published',
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
}
