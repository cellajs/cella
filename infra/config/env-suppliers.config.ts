import { defineEnvSuppliers } from '../lib/env-suppliers';
import { embedFrameAncestors, frontendCsp } from './frontend-csp.config';

/** Suppliers for app-wide compose `${VAR}` placeholders that are not service-to-service bindings, which are declared as `bindings` on the service registry entry. */
export const appEnvSuppliers = defineEnvSuppliers({
  // The app origin every service derives its URLs from (shared/src/config-builder/app-config.ts).
  APP_ORIGIN: ({ serviceUrl }) => serviceUrl('frontend'),
  FRONTEND_CSP: ({ config }) => frontendCsp(config),
  FRONTEND_EMBED_CSP: ({ config }) => frontendCsp(config, embedFrameAncestors(config)),
  ORIGIN_HOST: ({ naming, region }) => `${naming.frontendBucket}.s3.${region}.scw.cloud`,
});
