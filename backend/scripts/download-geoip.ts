import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

const OUT_DIR = resolve(import.meta.dirname, '../geoip');

const monthArg = process.argv[2];
const now = new Date();
const month = monthArg ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

const databases = [
  { name: 'country', url: `https://download.db-ip.com/free/dbip-country-lite-${month}.mmdb.gz`, out: 'dbip-country-lite.mmdb' },
  { name: 'asn', url: `https://download.db-ip.com/free/dbip-asn-lite-${month}.mmdb.gz`, out: 'dbip-asn-lite.mmdb' },
] as const;

const download = async ({ name, url, out }: (typeof databases)[number]) => {
  const dest = resolve(OUT_DIR, out);
  const tmp = `${dest}.tmp`;
  console.info(`[geoip] ${name}: fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`[geoip] ${name}: HTTP ${res.status} — try a previous month (e.g. \`pnpm geoip:download 2026-04\`)`);

  mkdirSync(dirname(dest), { recursive: true });
  // biome-ignore lint/suspicious/noExplicitAny: web stream to node stream interop is well-typed at runtime
  await pipeline(res.body as any, createGunzip(), createWriteStream(tmp));
  await rename(tmp, dest);
  console.info(`[geoip] ${name}: wrote ${dest}`);
};

for (const db of databases) {
  try {
    await download(db);
  } catch (err) {
    // Best-effort cleanup of a partial file.
    const tmp = resolve(OUT_DIR, `${db.out}.tmp`);
    if (existsSync(tmp)) await unlink(tmp).catch(() => {});
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
