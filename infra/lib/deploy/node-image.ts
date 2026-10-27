/**
 * The digests of the `node` images the engine starts on its own machines with a key beside them: the runner machine (the runner key) and the
 * builder (the builder and boot keys). Whoever controls a tag on Docker Hub can move it; a digest names one image. A Node bump at the root
 * `engines.node` adds its two digests here, read with `docker buildx imagetools inspect node:<version>-bookworm` (and `-bookworm-slim`).
 */
const nodeImageDigests: Record<string, Record<NodeImageVariant, string>> = {
  '26.12.1': {
    bookworm: 'sha256:5c4012d11d9857c42713ba511fbc19645cac1706bb710d51d42b0d301dff7f88',
    'bookworm-slim': 'sha256:28147155d47dc31abe0a46e0d12b59b2fb3d0a2dcc5dc65fce76a074180b16fe',
  },
};

/** `bookworm` has git and curl (the runner fetches with it); `bookworm-slim` is the builder's, the boot image's base. */
export type NodeImageVariant = 'bookworm' | 'bookworm-slim';

/**
 * The `node` image at a Node version, pinned by digest.
 * @throws when the version has no digest here: a Node bump adds it
 */
export function pinnedNodeImage(nodeVersion: string, variant: NodeImageVariant): string {
  const digest = nodeImageDigests[nodeVersion]?.[variant];
  if (!digest) throw new Error(`lib/deploy/node-image.ts has no digest of node:${nodeVersion}-${variant}: a Node bump adds it`);
  return `docker.io/library/node:${nodeVersion}-${variant}@${digest}`;
}
