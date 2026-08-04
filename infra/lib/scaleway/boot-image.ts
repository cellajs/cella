import type { FetchLike } from '../utils/fetch-like';
import { resolveImageDigest } from './registry-digest';

/** Current boot runner image repository name (the tag built in tasks/build-images.ts and CI). */
export const BOOT_IMAGE_NAME = 'infra-boot';

/**
 * Boot runner image names used before the 2026-07 `cella-boot` to `infra-boot`
 * rename. A live VM generation deployed under the old name pins its boot image by
 * that name plus its release sha, and a manifest digest is only pullable from the
 * repository it lives in, so a pre-rename generation's boot image exists in the
 * registry ONLY under the legacy repository. Resolution falls back to these names
 * when the current name has no manifest for a generation's sha, so a deploy can
 * still plan (and pin) pre-rename generations. Removable once no live generation
 * predates the rename, which is one successful deploy per environment.
 */
export const LEGACY_BOOT_IMAGE_NAMES = ['cella-boot'] as const;

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

function statusOf(err: unknown): number | undefined {
  return (err as { status?: number } | null)?.status;
}

/**
 * Resolve a generation's boot image to the name+digest it is pullable by. Tries
 * the current name first; on a 404 (the tag is genuinely absent under that name)
 * it tries each legacy name in turn, so a generation deployed before the rename
 * resolves under its original repository. Only a 404 triggers a legacy attempt;
 * auth and network failures are rethrown immediately. If every name 404s, the
 * error for the current name is rethrown so the message names the current image.
 */
export async function resolveBootImage(opts: ResolveBootImageOptions): Promise<ResolvedBootImage> {
  const { registry, releaseSha, secretKey, fetchImpl } = opts;
  let primaryError: unknown;
  for (const image of [BOOT_IMAGE_NAME, ...LEGACY_BOOT_IMAGE_NAMES]) {
    try {
      const digest = await resolveImageDigest({ registry, image, tag: releaseSha, secretKey, fetchImpl });
      return { image, digest };
    } catch (err) {
      if (image === BOOT_IMAGE_NAME) primaryError = err;
      // Only a not-found justifies trying an older name; anything else is a real
      // failure that a legacy lookup would hit too.
      if (statusOf(err) !== 404) throw err;
    }
  }
  throw primaryError ?? new Error(`No boot image manifest for ${BOOT_IMAGE_NAME}:${releaseSha} in ${registry}.`);
}
