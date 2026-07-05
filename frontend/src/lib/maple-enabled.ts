import { appConfig } from 'shared';
import { isDebugMode } from '~/env';

/**
 * Whether the Maple browser SDK runs in this environment. Single source of
 * truth: lib/maple.ts inits the SDK (which owns tracing) when true, and
 * lib/otel.ts registers the dev-only local tracer when false — so exactly
 * one tracer provider ever registers.
 */
export const mapleEnabled = !!appConfig.maplePublicIngestKey && (appConfig.mode !== 'development' || isDebugMode);
