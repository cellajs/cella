import { isRecord } from '../utils/guards';

/** Where a release's image archives, frontend archive and manifest live in the boot-diag bucket: `releases/<sha>/`, kept 60 days. */
export const RELEASES_PREFIX = 'releases/';

/** Where the deploy writes each machine's composed env file, deleted once the machine booted and within a day by the bucket's rule. */
export const ENV_PREFIX = 'env/';

/** Name of the boot runner's image repository, and of its archive. */
export const BOOT_IMAGE_NAME = 'infra-boot';

export const releaseArchiveKey = (sha: string, name: string) => `${RELEASES_PREFIX}${sha}/images/${name}.tar`;
export const releaseManifestKey = (sha: string) => `${RELEASES_PREFIX}${sha}/manifest.json`;
export const frontendArchiveKey = (sha: string) => `${RELEASES_PREFIX}${sha}/frontend.tar`;
export const envObjectKey = (machine: string) => `${ENV_PREFIX}${machine}.env`;

/** The name a deploy gives the machine of one service it boots for a release, which names that machine's env file. */
export function releaseMachine(service: string, sha: string): string {
  return `${service}-${sha.slice(0, 10)}`;
}

/**
 * One archive as the builder wrote it: its sha256, which a machine refuses an archive without, and its md5 and size, which Object Storage
 * reports for a single PUT (the ETag and Content-Length), so the deploy checks an archive from its metadata alone.
 */
export interface ArchiveDigest {
  sha256: string;
  md5: string;
  bytes: number;
}

/** A release's manifest, `releases/<sha>/manifest.json`: every image archive by its repository name, and the frontend archive. */
export interface ReleaseManifest {
  release: string;
  images: Record<string, ArchiveDigest>;
  frontend?: ArchiveDigest;
}

function digestOf(value: unknown, where: string): ArchiveDigest {
  if (!isRecord(value)) throw new Error(`release manifest: ${where} is not an object`);
  const { sha256, md5, bytes } = value;
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`release manifest: ${where} has no sha256`);
  if (typeof md5 !== 'string' || !/^[0-9a-f]{32}$/.test(md5)) throw new Error(`release manifest: ${where} has no md5`);
  if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes <= 0) throw new Error(`release manifest: ${where} has no size`);
  return { sha256, md5, bytes };
}

/**
 * Parse a release's manifest, refusing one of another release or with an entry that is not a digest: the builder writes it from its own
 * output, so its form is checked before a digest of it reaches a machine.
 */
export function parseReleaseManifest(text: string, sha: string): ReleaseManifest {
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed) || parsed.release !== sha) throw new Error(`release manifest: not the manifest of ${sha}`);
  if (!isRecord(parsed.images)) throw new Error('release manifest: no images');
  const images: Record<string, ArchiveDigest> = {};
  for (const [name, digest] of Object.entries(parsed.images)) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`release manifest: '${name}' is no image name`);
    images[name] = digestOf(digest, name);
  }
  return { release: sha, images, ...(parsed.frontend === undefined ? {} : { frontend: digestOf(parsed.frontend, 'frontend') }) };
}
