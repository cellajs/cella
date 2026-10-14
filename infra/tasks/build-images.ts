import { BOOT_IMAGE_NAME } from '../lib/scaleway/release-image';
import { parseServiceRows } from '../lib/utils/service-rows';

// The bake definition the builder machine runs: targets derive from the deploy's
// build matrix; the builder shares no cache between two builds.

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

/** A `docker buildx bake` definition covering every app image + the boot runner, with no cache: nothing is shared between two builds. */
export function bakeDefinition(rows: BuildImageRow[], opts: BakeOptions): { group: unknown; target: Record<string, unknown> } {
  const context = opts.context ?? '.';
  const image = (service: string) => `${opts.registry}/${opts.namespace}/${service}:${opts.tag}`;
  const target: Record<string, unknown> = {};
  for (const row of rows) {
    target[row.service] = {
      context,
      dockerfile: row.dockerfile,
      ...(row.target ? { target: row.target } : {}),
      tags: [image(row.service)],
      args: { RELEASE_SHA: opts.tag },
    };
  }
  target['boot-runner'] = {
    context: `${context === '.' ? '' : `${context}/`}infra/boot`,
    dockerfile: 'Dockerfile',
    tags: [image(BOOT_IMAGE_NAME)],
  };
  return { group: { default: { targets: [...rows.map((row) => row.service), 'boot-runner'] } }, target };
}
