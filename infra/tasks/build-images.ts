import { pinnedNodeImage } from '../lib/deploy/node-image';
import { BOOT_IMAGE_NAME } from '../lib/deploy/release-archives';
import { parseServiceRows } from '../lib/utils/service-rows';

// The bake definition the builder machine runs: targets derive from the deploy's build matrix, and each image is written as an archive.

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
  /** The root package.json `engines.node`: every image's `FROM` takes the `node` image at it by digest, as `NODE_IMAGE`. */
  nodeVersion: string;
  /** Path of the build context relative to the bake process cwd (the repo root). */
  context?: string;
  /** The folder each image's archive is written to, as `<name>.tar`. */
  archiveDir: string;
}

/**
 * A `docker buildx bake` definition covering every app image and the boot runner, in two groups: `services` bakes while the boot bundle is
 * built, `boot` after it. Each image is written to `<archiveDir>/<name>.tar` in the format `docker load` reads, tagged as the release's
 * compose file names it, and pushed nowhere.
 */
export function bakeDefinition(rows: BuildImageRow[], opts: BakeOptions): { group: unknown; target: Record<string, unknown> } {
  const context = opts.context ?? '.';
  const image = (name: string) => `${opts.registry}/${opts.namespace}/${name}:${opts.releaseSha}`;
  const archive = (name: string) => [`type=docker,dest=${opts.archiveDir}/${name}.tar`];
  const target: Record<string, unknown> = {};
  for (const row of rows) {
    target[row.service] = {
      context,
      dockerfile: row.dockerfile,
      ...(row.target ? { target: row.target } : {}),
      tags: [image(row.service)],
      args: { RELEASE_SHA: opts.releaseSha, NODE_IMAGE: pinnedNodeImage(opts.nodeVersion, 'alpine') },
      output: archive(row.service),
    };
  }
  target['boot-runner'] = {
    context: `${context === '.' ? '' : `${context}/`}infra/boot`,
    dockerfile: 'Dockerfile',
    tags: [image(BOOT_IMAGE_NAME)],
    args: { NODE_IMAGE: pinnedNodeImage(opts.nodeVersion, 'bookworm-slim') },
    output: archive(BOOT_IMAGE_NAME),
  };
  const services = rows.map((row) => row.service);
  return {
    group: { default: { targets: [...services, 'boot-runner'] }, services: { targets: services }, boot: { targets: ['boot-runner'] } },
    target,
  };
}
