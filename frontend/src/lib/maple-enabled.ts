import { appConfig } from 'shared';
import { isMapleOptedIn } from '~/env';

/** Select Maple tracing or the development tracer so exactly one provider registers. */
export const mapleEnabled = !!appConfig.maplePublicIngestKey && (appConfig.mode !== 'development' || isMapleOptedIn);
