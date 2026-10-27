import { BOOT_IMAGE_NAME } from '../lib/scaleway/release-image';
import { parseServiceRows } from '../lib/utils/service-rows';

// The bake definition the builder machine runs: targets derive from the deploy's
// build matrix; two builds share only the layer cache of their epoch.

export interface BuildImageRow {
  service: string;
  dockerfile: string;
  target?: string;
}

export function parseBuildRows(raw: string): BuildImageRow[] {
  // The stage of a multi-stage Dockerfile: without it every image of that file would be its last stage.
  return parseServiceRows(raw, '--build-images-json', { required: ['service', 'dockerfile'], optional: ['target'] });
}

export interface BakeOptions {
  registry: string;
  namespace: string;
  /** The release sha: every image's tag and its `RELEASE_SHA`. */
  releaseSha: string;
  /** The build epoch: a second tag on every image, which says it was built under the current builder key. */
  epoch: string;
  /** The root package.json `engines.node`: the Node every image's `FROM` uses. */
  nodeVersion: string;
  /** Path of the build context relative to the bake process cwd (the repo root). */
  context?: string;
  /** The registry tag of each image's layer cache, which only the builder writes (D13); none, no cache. */
  cacheTag?: string;
}

/**
 * A `docker buildx bake` definition covering every app image + the boot runner, in two groups: `services` bakes while the boot bundle is built,
 * `boot` after it. With a `cacheTag`, each image reads and writes its layer cache under that tag in the registry.
 */
export function bakeDefinition(rows: BuildImageRow[], opts: BakeOptions): { group: unknown; target: Record<string, unknown> } {
  const context = opts.context ?? '.';
  const image = (service: string) => `${opts.registry}/${opts.namespace}/${service}:${opts.releaseSha}`;
  const tags = (service: string) => [image(service), `${image(service)}-e${opts.epoch}`];
  const cache = (service: string) =>
    opts.cacheTag
      ? {
          'cache-from': [`type=registry,ref=${opts.registry}/${opts.namespace}/${service}:${opts.cacheTag}`],
          'cache-to': [`type=registry,ref=${opts.registry}/${opts.namespace}/${service}:${opts.cacheTag},mode=max`],
        }
      : {};
  const target: Record<string, unknown> = {};
  for (const row of rows) {
    target[row.service] = {
      context,
      dockerfile: row.dockerfile,
      ...(row.target ? { target: row.target } : {}),
      tags: tags(row.service),
      args: { RELEASE_SHA: opts.releaseSha, NODE_VERSION: opts.nodeVersion },
      ...cache(row.service),
    };
  }
  target['boot-runner'] = {
    context: `${context === '.' ? '' : `${context}/`}infra/boot`,
    dockerfile: 'Dockerfile',
    tags: tags(BOOT_IMAGE_NAME),
    args: { NODE_VERSION: opts.nodeVersion },
    ...cache(BOOT_IMAGE_NAME),
  };
  const services = rows.map((row) => row.service);
  return {
    group: { default: { targets: [...services, 'boot-runner'] }, services: { targets: services }, boot: { targets: ['boot-runner'] } },
    target,
  };
}
