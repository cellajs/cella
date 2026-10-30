/**
 * The digests of the `node` images a key meets: the runner machine (the runner key), the builder (the builder key), and the bases
 * of the images the builder bakes, which run beside the services' runtime secrets and the host Docker socket. Whoever controls a tag on
 * Docker Hub can move it; a digest names one image. A Node bump at the root `engines.node` adds its digests here, each the index digest
 * `docker buildx imagetools inspect node:<version>-<variant>` prints.
 */
const nodeImageDigests: Record<string, Record<NodeImageVariant, string>> = {
  '26.12.1': {
    alpine: 'sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797',
    bookworm: 'sha256:5c4012d11d9857c42713ba511fbc19645cac1706bb710d51d42b0d301dff7f88',
    'bookworm-slim': 'sha256:28147155d47dc31abe0a46e0d12b59b2fb3d0a2dcc5dc65fce76a074180b16fe',
  },
};

/**
 * `alpine` is the service images' base, `bookworm-slim` the builder's and the boot image's; `bookworm` has git and curl (the runner fetches
 * with it).
 */
export type NodeImageVariant = 'alpine' | 'bookworm' | 'bookworm-slim';

/**
 * The `node` image at a Node version, pinned by digest.
 * @throws when the version has no digest here: a Node bump adds it
 */
export function pinnedNodeImage(nodeVersion: string, variant: NodeImageVariant): string {
  const digest = nodeImageDigests[nodeVersion]?.[variant];
  if (!digest) throw new Error(`lib/deploy/node-image.ts has no digest of node:${nodeVersion}-${variant}: a Node bump adds it`);
  return `docker.io/library/node:${nodeVersion}-${variant}@${digest}`;
}
