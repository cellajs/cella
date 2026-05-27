import _default from '../../default-config';
import development from '../../development-config';
import production from '../../production-config';
import staging from '../../staging-config';
import test from '../../test-config';
import tunnel from '../../tunnel-config';
import type { S3Config } from './types';
import { mergeDeep } from './utils';

type Config = Omit<typeof _default, 's3'> & { s3: S3Config };
const configModes = { development, tunnel, staging, production, test } satisfies Record<Config['mode'], unknown>;

// APP_MODE allows selecting the config independently of NODE_ENV.
// This lets containers run with NODE_ENV=production (to avoid dev-only
// behaviour like pino-pretty worker threads) while still loading the
// development config for correct slug/naming.
const mode = (process.env.APP_MODE || process.env.NODE_ENV || 'development') as Config['mode'];

/**
 * Merged app configuration which combines default config with environment-specific overrides.
 * Type is preserved from _default to maintain literal types for Drizzle v1 strict enum typing.
 */
const merged = mergeDeep(_default, configModes[mode]);

// Allow environment variables to override URLs — enables deploying the dev
// config to Scaleway containers while keeping localhost defaults for local dev.
if (process.env.FRONTEND_URL) merged.frontendUrl = process.env.FRONTEND_URL;
if (process.env.BACKEND_URL) merged.backendUrl = process.env.BACKEND_URL;
if (process.env.BACKEND_AUTH_URL) merged.backendAuthUrl = process.env.BACKEND_AUTH_URL;
if (process.env.YJS_URL) merged.yjsUrl = process.env.YJS_URL;
if (process.env.AI_API_URL) merged.aiApiUrl = process.env.AI_API_URL;

// Derive S3 bucket names and CDN URLs from slug + mode prefix unless explicitly overridden.
// Each environment gets dedicated buckets (e.g. raak-public, raak-development-public).
const s3 = merged.s3 as S3Config;
const bucketPrefix = merged.slug;
s3.publicBucket ??= `${bucketPrefix}-public`;
s3.privateBucket ??= `${bucketPrefix}-private`;
s3.publicCDNUrl ??= `https://${s3.publicBucket}.${s3.host}`;
s3.privateCDNUrl ??= `https://${s3.privateBucket}.${s3.host}`;

export const appConfig = merged as Config;
