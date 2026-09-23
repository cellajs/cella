import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { type AsnResponse, type CountryResponse, type Response as MmdbResponse, open, type Reader } from 'maxmind';
import { appConfig } from 'shared';
import { env } from '#/env';
import { baseLog } from '#/lib/pino';
import { isPublicIp } from '#/utils/ip-subnet';

type GeoipKind = 'country' | 'asn';

type GeoipDatabase<T extends MmdbResponse> = {
  kind: GeoipKind;
  /** Local MMDB path; `${path}.etag` remembers the object version last downloaded. */
  path: string;
  /** Object name under the source prefix. */
  object: string;
  reader: Reader<T> | null;
  warned: boolean;
};

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

const country: GeoipDatabase<CountryResponse> = {
  kind: 'country',
  path: env.GEOIP_COUNTRY_DB_PATH,
  object: 'dbip-country-lite.mmdb.gz',
  reader: null,
  warned: false,
};
const asn: GeoipDatabase<AsnResponse> = {
  kind: 'asn',
  path: env.GEOIP_ASN_DB_PATH,
  object: 'dbip-asn-lite.mmdb.gz',
  reader: null,
  warned: false,
};

/**
 * Where the DB-IP Lite databases (CC BY 4.0, attribution: IP geolocation by DB-IP, https://db-ip.com) are fetched
 * from, or null when the refresh is off (`GEOIP_SOURCE_URL=off`). Each API process downloads the gzipped MMDB objects
 * from this prefix at boot and re-checks daily, so a refresh published by `pnpm infra` reaches every process within a
 * day. The default is the `geoip/` prefix of the app's public bucket, which in development is the shared template bucket.
 */
export const geoipSourceUrl = (): string | null => {
  const configured = env.GEOIP_SOURCE_URL;
  if (configured === 'off') return null;
  const base = configured || `${appConfig.s3.publicCDNUrl}/geoip`;
  return base.replace(/\/$/, '');
};

const loadReader = async <T extends MmdbResponse>(db: GeoipDatabase<T>): Promise<Reader<T> | null> => {
  if (db.reader) return db.reader;
  if (!existsSync(db.path)) {
    if (!db.warned) {
      baseLog.warn(`GeoIP ${db.kind} database not found: ${db.kind} lookups disabled until the next refresh`, {
        path: db.path,
      });
      db.warned = true;
    }
    return null;
  }
  db.reader = await open<T>(db.path);
  return db.reader;
};

/**
 * Which address to geolocate. Local sign-ins come from loopback or a private range, which no database can place, so
 * development substitutes a sample public address and the tile and the sign-in notice show a country. The raw
 * address the session stores its hashes of is never touched.
 */
export const lookupTargetIp = (
  ip: string | null | undefined,
  { mode, sampleIp }: { mode: string; sampleIp: string },
): string | null => {
  if (!ip) return null;
  if (mode === 'development' && sampleIp && !isPublicIp(ip)) return sampleIp;
  return ip;
};

/**
 * ISO-3166 alpha-2 country code and ASN for an IP; either is null when its database is missing or the IP is unknown.
 * Never throws, so auth and session paths can call it directly.
 */
export const lookupIp = async (
  ip: string | null | undefined,
): Promise<{ country: string | null; asn: number | null }> => {
  const target = lookupTargetIp(ip, { mode: appConfig.mode, sampleIp: env.GEOIP_DEV_SAMPLE_IP });
  if (!target) return { country: null, asn: null };
  try {
    const [countryReader, asnReader] = await Promise.all([loadReader(country), loadReader(asn)]);
    return {
      country: countryReader?.get(target)?.country?.iso_code ?? null,
      asn: asnReader?.get(target)?.autonomous_system_number ?? null,
    };
  } catch (err) {
    baseLog.warn('GeoIP lookup failed', { err, ip: target });
    return { country: null, asn: null };
  }
};

const readEtag = async (path: string): Promise<string | null> => {
  try {
    return (await readFile(`${path}.etag`, 'utf8')).trim() || null;
  } catch {
    return null;
  }
};

/**
 * Conditional download of one database: a 304 leaves the file alone, a 200 replaces it atomically (gunzip into a
 * temp file, rename) and drops the open reader so the next lookup opens the new data.
 */
const refreshDatabase = async <T extends MmdbResponse>(
  db: GeoipDatabase<T>,
  source: string,
): Promise<'updated' | 'unchanged' | 'failed'> => {
  const url = `${source}/${db.object}`;
  const etag = existsSync(db.path) ? await readEtag(db.path) : null;
  const tmp = `${db.path}.tmp`;
  try {
    const res = await fetch(url, { headers: etag ? { 'if-none-match': etag } : {} });
    if (res.status === 304) return 'unchanged';
    if (!res.ok) {
      baseLog.warn(`GeoIP ${db.kind} database fetch failed`, { url, status: res.status });
      return 'failed';
    }
    // A few megabytes once a day: buffering beats a stream pipeline here, and a truncated archive fails in gunzip before the rename.
    const archive = Buffer.from(await res.arrayBuffer());
    await mkdir(dirname(db.path), { recursive: true });
    await writeFile(tmp, gunzipSync(archive));
    await rename(tmp, db.path);
    const newEtag = res.headers.get('etag');
    if (newEtag) await writeFile(`${db.path}.etag`, newEtag);
    db.reader = null;
    db.warned = false;
    baseLog.info(`GeoIP ${db.kind} database updated`, { url });
    return 'updated';
  } catch (err) {
    await unlink(tmp).catch(() => {});
    baseLog.warn(`GeoIP ${db.kind} database refresh failed`, { url, err });
    return 'failed';
  }
};

/** Fetches both databases from the source when they changed. Never throws. */
export const refreshGeoipDatabases = async (): Promise<
  Record<GeoipKind, 'updated' | 'unchanged' | 'failed' | 'off'>
> => {
  const source = geoipSourceUrl();
  if (!source) return { country: 'off', asn: 'off' };
  const [countryResult, asnResult] = await Promise.all([
    refreshDatabase(country, source),
    refreshDatabase(asn, source),
  ]);
  return { country: countryResult, asn: asnResult };
};

/**
 * Boot-time download plus a daily re-check, per process: every API replica keeps its own copy current. The timer is
 * unref'd so it never holds the process open; the returned handle stops it on shutdown.
 */
export const startGeoipRefresh = (intervalMs: number = REFRESH_INTERVAL_MS): (() => void) => {
  if (!geoipSourceUrl()) return () => {};
  void refreshGeoipDatabases();
  const timer = setInterval(() => void refreshGeoipDatabases(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
};
