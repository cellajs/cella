import type { ImportResource } from '@pulumi/pulumi/automation';
import type { EngineConfig } from '../../config/engine-config';
import { deriveInfra } from '../naming';
import { protectsStoredData, type RuntimeSecretDefinition, runtimeSecrets } from '../runtime-secrets';
import type { SecretManagerSecret } from '../scaleway/scaleway-secret-manager';
import { ENGINE_FOLDER, RUNTIME_FOLDER } from '../scaleway/secret-paths';
import { appStorageNeeds, services } from '../services';
import { urnsOf, withoutUrns, withResources } from './stack-export';

const BUCKET = 'scaleway:object/bucket:Bucket';
const BUCKET_POLICY = 'scaleway:object/bucketPolicy:BucketPolicy';
const SECRET = 'scaleway:secrets/secret:Secret';

/** One resource a teardown leaves live, by its type and name in the program. */
export interface KeptResource {
  type: string;
  name: string;
  /** What a setup finds it by: a bucket's name, or a container's name in the runtime folder. None for a bucket policy, which the first `up` writes anew. */
  adopt?: { bucket: string } | { secret: string };
}

type ListedSecret = Pick<SecretManagerSecret, 'id' | 'name' | 'path'>;

/**
 * What a teardown keeps and a setup adopts: the upload buckets and the boot-diag bucket with their policies, the state bucket's policy, and
 * the containers of the values that protect stored data, which the final dump in the boot-diag bucket needs. The program declares each
 * with `retainOnDelete`; the state bucket itself is no resource of the program.
 */
export function keptResources(appConfig: EngineConfig, definitions: readonly RuntimeSecretDefinition[] = runtimeSecrets): KeptResource[] {
  const { naming } = deriveInfra(appConfig);
  const bucket = (name: string, live: string, policy: string): KeptResource[] => [
    { type: BUCKET, name, adopt: { bucket: live } },
    { type: BUCKET_POLICY, name: policy },
  ];
  return [
    ...(appStorageNeeds(services).uploadBuckets
      ? [
          ...bucket('public-uploads-bucket', naming.publicBucket, 'public-uploads-policy'),
          ...bucket('private-uploads-bucket', naming.privateBucket, 'private-uploads-policy'),
        ]
      : []),
    ...bucket('boot-diag-bucket', naming.bootDiagBucket, 'boot-diag-policy'),
    { type: BUCKET_POLICY, name: 'state-bucket-policy' },
    ...definitions
      .filter(protectsStoredData)
      .map((definition): KeptResource => ({ type: SECRET, name: `secret-${definition.secretName}`, adopt: { secret: definition.secretName } })),
  ];
}

/** A resource's `<type>::<name>`, the end of its URN for a resource without a parent. */
const keyOf = (resource: Pick<KeptResource, 'type' | 'name'>) => `${resource.type}::${resource.name}`;
const urnKey = (urn: string) => urn.split('::').slice(-2).join('::');

const trimSlashes = (path: string) => `/${path.split('/').filter(Boolean).join('/')}`;

/** The live container of a kept value: its name, in the runtime folder; a container of that name in another folder is not it. */
function keptContainer(listed: readonly ListedSecret[], name: string): ListedSecret | undefined {
  return listed.find((secret) => secret.name === name && trimSlashes(secret.path) === trimSlashes(RUNTIME_FOLDER));
}

/**
 * A stack export ready for a teardown's destroy: without the kept resources, which so stay live, and with every other bucket emptied on
 * delete, as a state an older program wrote records `forceDestroy: false` for a bucket the destroy would then fail on. `kept` and
 * `emptied` name the resources each edit touched.
 */
export function destroyableState(exported: unknown, kept: readonly KeptResource[]): { document: unknown; kept: string[]; emptied: string[] } {
  const keys = new Set(kept.map(keyOf));
  const urns = urnsOf(exported).filter((urn) => keys.has(urnKey(urn)));
  const emptied: string[] = [];
  const forced = (properties: unknown) =>
    typeof properties === 'object' && properties !== null ? { ...properties, forceDestroy: true } : properties;
  const document = withResources(withoutUrns(exported, urns), (resource) => {
    if (resource.type !== BUCKET) return resource;
    emptied.push(urnKey(String(resource.urn)).split('::')[1] ?? '');
    return { ...resource, inputs: forced(resource.inputs), outputs: forced(resource.outputs) };
  });
  return { document, kept: urns.map((urn) => urnKey(urn).split('::')[1] ?? urn), emptied };
}

/** The folders a teardown empties. A container outside them is none of the engine's. */
export const engineFolders: readonly string[] = [RUNTIME_FOLDER, ENGINE_FOLDER];

/** The secret containers a teardown deletes: every one in the engine's folders, or below them, but the kept values' containers. */
export function sweptSecrets<Secret extends ListedSecret>(
  listed: readonly Secret[],
  kept: readonly KeptResource[],
  folders: readonly string[],
): Secret[] {
  const keep = new Set(
    kept.flatMap(({ adopt }) => (adopt && 'secret' in adopt ? [keptContainer(listed, adopt.secret)?.id ?? ''] : [])).filter(Boolean),
  );
  const roots = folders.map(trimSlashes);
  const inFolders = (path: string) => roots.some((root) => trimSlashes(path) === root || trimSlashes(path).startsWith(`${root}/`));
  return listed.filter((secret) => !keep.has(secret.id) && inFolders(secret.path));
}

/** What a setup finds live in the environment's project: the bucket names, and the secret containers. */
export interface KeptLive {
  buckets: readonly string[];
  secrets: readonly ListedSecret[];
}

/**
 * The imports a setup runs before its `up`: each kept resource that is live and absent from the state, under the type and name the program
 * declares it with, so the `up` updates it in place where it would otherwise fail to make it again. A bucket is imported as `<region>/<name>`
 * in the provider's default project, the environment's; a container as `<region>/<id>`. Empty for a stack that holds them all.
 */
export function importPlan(kept: readonly KeptResource[], live: KeptLive, exported: unknown, region: string): ImportResource[] {
  const inState = new Set(urnsOf(exported).map(urnKey));
  return kept.flatMap(({ type, name, adopt }): ImportResource[] => {
    if (!adopt || inState.has(keyOf({ type, name }))) return [];
    if ('bucket' in adopt) return live.buckets.includes(adopt.bucket) ? [{ type, name, id: `${region}/${adopt.bucket}` }] : [];
    const container = keptContainer(live.secrets, adopt.secret);
    return container ? [{ type, name, id: `${region}/${container.id}` }] : [];
  });
}
