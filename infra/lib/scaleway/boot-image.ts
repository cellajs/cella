import type { FetchLike } from '../utils/fetch-like';
import { resolveImageDigest } from './registry-digest';

/** Current boot runner image repository name (the tag built in tasks/build-images.ts and CI). */
export const BOOT_IMAGE_NAME = 'infra-boot';

/** The boot image name a generation's sha resolved under, with its manifest digest. */
export interface ResolvedBootImage {
  image: string;
  digest: string;
}

export interface ResolveBootImageOptions {
  /** Registry endpoint including namespace, e.g. `rg.nl-ams.scw.cloud/mynamespace`. */
  registry: string;
  /** Release sha (the boot image tag for this generation). */
  releaseSha: string;
  /** Scaleway secret key; registry basic auth is `nologin:<secret>`. */
  secretKey: string;
  fetchImpl?: FetchLike;
}

/** Resolve a generation's boot image to the name+digest it is pullable by. */
export async function resolveBootImage(opts: ResolveBootImageOptions): Promise<ResolvedBootImage> {
  const { registry, releaseSha, secretKey, fetchImpl } = opts;
  const digest = await resolveImageDigest({ registry, image: BOOT_IMAGE_NAME, tag: releaseSha, secretKey, fetchImpl });
  return { image: BOOT_IMAGE_NAME, digest };
}
