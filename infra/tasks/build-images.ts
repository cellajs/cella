import { BOOT_IMAGE_NAME } from '../lib/scaleway/boot-image';
import { parseServiceRows } from '../lib/utils/service-rows';

// Engine-side image builder behind `infra deploy --build`: targets derive from
// the same build matrix as CI; the `:buildcache` registry refs share the cache.

export interface BuildImageRow {
  service: string;
  dockerfile: string;
  target?: string;
}

export function parseBuildRows(raw: string): BuildImageRow[] {
  return parseServiceRows(raw, '--build-images-json', { required: ['service', 'dockerfile'] });
}

export interface BakeOptions {
  registry: string;
  namespace: string;
  tag: string;
  /** Path of the build context relative to the bake process cwd (the repo root). */
  context?: string;
}

/** A `docker buildx bake` definition covering every app image + the boot runner. */
export function bakeDefinition(
  rows: BuildImageRow[],
  opts: BakeOptions,
): { group: unknown; target: Record<string, unknown> } {
  const context = opts.context ?? '.';
  const image = (service: string) => `${opts.registry}/${opts.namespace}/${service}:${opts.tag}`;
  const cacheRef = (service: string) => `${opts.registry}/${opts.namespace}/${service}:buildcache`;
  const target: Record<string, unknown> = {};
  for (const row of rows) {
    target[row.service] = {
      context,
      dockerfile: row.dockerfile,
      ...(row.target ? { target: row.target } : {}),
      tags: [image(row.service)],
      args: { RELEASE_SHA: opts.tag },
      'cache-from': [`type=registry,ref=${cacheRef(row.service)}`],
      'cache-to': [`type=registry,ref=${cacheRef(row.service)},mode=max`],
    };
  }
  target['boot-runner'] = {
    context: `${context === '.' ? '' : `${context}/`}infra/boot`,
    dockerfile: 'Dockerfile',
    tags: [image(BOOT_IMAGE_NAME)],
    'cache-from': [`type=registry,ref=${cacheRef(BOOT_IMAGE_NAME)}`],
    'cache-to': [`type=registry,ref=${cacheRef(BOOT_IMAGE_NAME)},mode=max`],
  };
  return { group: { default: { targets: [...rows.map((row) => row.service), 'boot-runner'] } }, target };
}
