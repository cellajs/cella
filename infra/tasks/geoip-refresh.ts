import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { isMain } from '../lib/utils/is-main';
import { getFlag, getNumFlag } from './args';

export type GeoipKind = 'country' | 'asn';
export const GEOIP_KINDS: readonly GeoipKind[] = ['country', 'asn'];
export const DEFAULT_PREFIX = 'geoip';

/** Every published object is described here; the backend never reads it, operators and the staleness gate do. */
export interface GeoipManifest {
  month: string;
  publishedAt: string;
  files: Record<GeoipKind, { key: string; month: string; bytes: number; sha256: string }>;
}

/**
 * Publishing the DB-IP Lite GeoIP databases (CC BY 4.0) to the `geoip/` prefix of the app's public bucket, where every
 * API process downloads them from at boot and daily (backend/src/lib/geoip.ts). Effects are injected like
 * reset-database, so unit tests assert the order and every guard; `main` supplies the live ones for `pnpm infra`
 * (Refresh GeoIP data), the deploy pipeline (staleness-gated) and the monthly workflow.
 */
export interface GeoipRefreshPlan {
  bucket: string;
  prefix: string;
  /** Target DB-IP release, `YYYY-MM`. The previous month is the fallback when this one is not published yet. */
  month: string;
  /** Publish even when the manifest already carries `month`. */
  force: boolean;
  /** Skip when the manifest is younger than this many days (the deploy pipeline's gate). */
  maxAgeDays?: number;
  kinds: readonly GeoipKind[];

  // Injected effects
  fetchDatabase: (url: string) => Promise<{ status: number; body: Uint8Array | null }>;
  readManifest: () => Promise<GeoipManifest | null>;
  putObject: (key: string, body: Uint8Array, contentType: string) => Promise<void>;
  now: () => Date;
  log: (message: string) => void;
}

export type GeoipRefreshResult =
  | { published: false; skipped: 'up-to-date' | 'fresh'; manifest: GeoipManifest }
  | { published: true; manifest: GeoipManifest };

export const databaseUrl = (kind: GeoipKind, month: string): string =>
  `https://download.db-ip.com/free/dbip-${kind}-lite-${month}.mmdb.gz`;

export const objectKey = (prefix: string, kind: GeoipKind): string => `${prefix}/dbip-${kind}-lite.mmdb.gz`;
export const manifestKey = (prefix: string): string => `${prefix}/manifest.json`;

/** `YYYY-MM` in UTC for a date, optionally shifted by whole months. */
export const monthOf = (date: Date, shiftMonths = 0): string => {
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + shiftMonths, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
};

const MMDB_METADATA_MARKER = Buffer.from('\xab\xcd\xefMaxMind.com', 'latin1');

/**
 * A downloaded archive is trusted only when it gunzips and the payload ends in the MMDB metadata section; anything
 * else (an HTML error page, a truncated stream) is refused before a single byte reaches the bucket.
 */
export const verifyMmdbArchive = (archive: Uint8Array): { ok: true; bytes: number } | { ok: false; reason: string } => {
  let payload: Buffer;
  try {
    payload = gunzipSync(archive);
  } catch (err) {
    return { ok: false, reason: `not a gzip stream (${err instanceof Error ? err.message : String(err)})` };
  }
  // The marker sits at most 128 KiB from the end per the MMDB spec.
  const tail = payload.subarray(Math.max(0, payload.length - 128 * 1024));
  if (!tail.includes(MMDB_METADATA_MARKER)) return { ok: false, reason: 'no MMDB metadata section' };
  return { ok: true, bytes: payload.length };
};

const ageDays = (iso: string, now: Date): number => (now.getTime() - new Date(iso).getTime()) / 86_400_000;

/**
 * Order the refresh: read the manifest and decide whether anything is due, download and verify every database,
 * then upload the databases and finally the manifest. A failed download or verification aborts before any upload,
 * so the bucket only ever moves from one complete set to the next.
 */
export async function sequenceGeoipRefresh(plan: GeoipRefreshPlan): Promise<GeoipRefreshResult> {
  const existing = await plan.readManifest();
  if (existing && !plan.force) {
    if (existing.month === plan.month) {
      plan.log(`GeoIP data for ${plan.month} already published (${existing.publishedAt}); nothing to do.`);
      return { published: false, skipped: 'up-to-date', manifest: existing };
    }
    if (plan.maxAgeDays !== undefined && ageDays(existing.publishedAt, plan.now()) < plan.maxAgeDays) {
      plan.log(`GeoIP data published ${existing.publishedAt} is younger than ${plan.maxAgeDays} days; skipping.`);
      return { published: false, skipped: 'fresh', manifest: existing };
    }
  }

  const fallbackMonth = monthOf(new Date(`${plan.month}-01T00:00:00Z`), -1);
  const downloaded: Array<{ kind: GeoipKind; month: string; archive: Uint8Array; bytes: number }> = [];
  for (const kind of plan.kinds) {
    let month = plan.month;
    let response = await plan.fetchDatabase(databaseUrl(kind, month));
    if (response.status === 404) {
      plan.log(`DB-IP has not published ${kind} for ${month} yet; trying ${fallbackMonth}.`);
      month = fallbackMonth;
      response = await plan.fetchDatabase(databaseUrl(kind, month));
    }
    if (response.status !== 200 || !response.body) {
      throw new Error(`DB-IP ${kind} download failed with HTTP ${response.status} (${databaseUrl(kind, month)}).`);
    }
    const verified = verifyMmdbArchive(response.body);
    if (!verified.ok) throw new Error(`DB-IP ${kind} archive for ${month} rejected: ${verified.reason}.`);
    downloaded.push({ kind, month, archive: response.body, bytes: verified.bytes });
    plan.log(`${kind} ${month}: ${(response.body.length / 1_048_576).toFixed(1)} MiB gzipped, verified.`);
  }

  const files = {} as GeoipManifest['files'];
  for (const { kind, month, archive } of downloaded) {
    const key = objectKey(plan.prefix, kind);
    await plan.putObject(key, archive, 'application/gzip');
    files[kind] = { key, month, bytes: archive.length, sha256: createHash('sha256').update(archive).digest('hex') };
    plan.log(`uploaded ${plan.bucket}/${key}`);
  }
  const manifest: GeoipManifest = {
    month: downloaded.reduce(
      (newest, file) => (file.month > newest ? file.month : newest),
      downloaded[0]?.month ?? plan.month,
    ),
    publishedAt: plan.now().toISOString(),
    files,
  };
  await plan.putObject(manifestKey(plan.prefix), Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
  plan.log(`uploaded ${plan.bucket}/${manifestKey(plan.prefix)} (month ${manifest.month})`);
  return { published: true, manifest };
}

/** Live effects: DB-IP over HTTPS, the bucket over the S3 API with the SCW key in the environment (admin or CI deploy). */
export async function createLiveEffects(opts: { bucket: string; region: string; prefix: string }) {
  const { S3Client, GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: opts.region,
    endpoint: `https://s3.${opts.region}.scw.cloud`,
    credentials: {
      accessKeyId: process.env.SCW_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.SCW_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
    forcePathStyle: false,
  });
  return {
    fetchDatabase: async (url: string) => {
      const res = await fetch(url);
      return { status: res.status, body: res.ok ? new Uint8Array(await res.arrayBuffer()) : null };
    },
    readManifest: async (): Promise<GeoipManifest | null> => {
      try {
        const out = await s3.send(new GetObjectCommand({ Bucket: opts.bucket, Key: manifestKey(opts.prefix) }));
        const text = await out.Body?.transformToString();
        return text ? (JSON.parse(text) as GeoipManifest) : null;
      } catch (err) {
        if (err instanceof Error && (err.name === 'NoSuchKey' || err.name === 'NotFound')) return null;
        throw err;
      }
    },
    putObject: async (key: string, body: Uint8Array, contentType: string) => {
      await s3.send(
        new PutObjectCommand({
          Bucket: opts.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=3600',
        }),
      );
    },
  };
}

/**
 * CLI: `tsx infra/tasks/geoip-refresh.ts --bucket <name> --region <region> [--prefix geoip] [--month YYYY-MM]
 * [--force] [--max-age-days N]`. Needs SCW_ACCESS_KEY / SCW_SECRET_KEY (or AWS_*) with write access to the bucket.
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const bucket = getFlag(argv, '--bucket');
  const region = getFlag(argv, '--region');
  if (!bucket || !region) {
    process.stderr.write('geoip-refresh requires --bucket and --region\n');
    process.exit(2);
  }
  const prefix = getFlag(argv, '--prefix') ?? DEFAULT_PREFIX;
  const maxAgeRaw = getFlag(argv, '--max-age-days');
  const effects = await createLiveEffects({ bucket, region, prefix });
  const result = await sequenceGeoipRefresh({
    bucket,
    prefix,
    month: getFlag(argv, '--month') ?? monthOf(new Date()),
    force: argv.includes('--force'),
    maxAgeDays: maxAgeRaw === undefined ? undefined : getNumFlag(argv, '--max-age-days', 0),
    kinds: GEOIP_KINDS,
    ...effects,
    now: () => new Date(),
    log: (message) => process.stdout.write(`  ${message}\n`),
  });
  process.stdout.write(
    result.published
      ? `✓ GeoIP data ${result.manifest.month} published to ${bucket}/${prefix}\n`
      : `✓ GeoIP data left as is (${result.skipped}: ${result.manifest.month}, ${result.manifest.publishedAt})\n`,
  );
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`✖ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
