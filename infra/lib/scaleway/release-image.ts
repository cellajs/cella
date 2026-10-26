import type { FetchLike } from '../utils/fetch-like';
import { resolveImageDigest } from './registry-digest';

/** Current boot runner image repository name (the tag built in tasks/build-images.ts and CI). */
export const BOOT_IMAGE_NAME = 'infra-boot';

/** An image of a release, with the manifest digest its tag resolved to. */
export interface ResolvedImage {
  image: string;
  digest: string;
}

export interface ResolveReleaseImageOptions {
  /** Registry endpoint including namespace, e.g. `rg.nl-ams.scw.cloud/mynamespace`. */
  registry: string;
  /** Image repository inside the namespace, e.g. `infra-boot` or `backend`. */
  image: string;
  /** Release sha, the tag every image of a release carries. */
  releaseSha: string;
  /** Scaleway secret key; registry basic auth is `nologin:<secret>`. */
  secretKey: string;
  fetchImpl?: FetchLike;
}

/** Resolve one image of a release to the digest it is pullable by, so a machine runs exactly what was built for it. */
export async function resolveReleaseImage(opts: ResolveReleaseImageOptions): Promise<ResolvedImage> {
  const { registry, image, releaseSha, secretKey, fetchImpl } = opts;
  const digest = await resolveImageDigest({ registry, image, tag: releaseSha, secretKey, fetchImpl });
  return { image, digest };
}

/** The repository a service's compose image reference pulls from: `${REGISTRY}/backend:${JOBS_TAG:-latest}` is `backend`. */
export function imageRepositoryOf(imageRef: string): string {
  const repository = imageRef.match(/^\$\{REGISTRY\}\/([^/:$]+):\$\{[A-Z0-9_]+_TAG(?::-[^}]*)?\}$/)?.[1];
  if (!repository) throw new Error(`release-image: '${imageRef}' is not \${REGISTRY}/<repository>:\${<SLUG>_TAG}, so it cannot be pinned by digest`);
  return repository;
}
