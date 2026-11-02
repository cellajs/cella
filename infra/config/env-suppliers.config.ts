import * as pulumi from '@pulumi/pulumi';
import { defineEnvSuppliers } from '../lib/env-suppliers';
import { region, serviceUrl } from '../pulumi-context';
import { frontendBucketName } from '../resources/storage';
import { frontendCsp } from './frontend-csp.config';

/** App-owned suppliers for app-wide compose `${VAR}` placeholders that are not service-to-service bindings, which are declared as `bindings` on the service registry entry. */
export const appEnvSuppliers = defineEnvSuppliers({
  // The app origin every service derives its URLs from (shared/src/config-builder/app-config.ts).
  APP_ORIGIN: () => serviceUrl('frontend'),
  FRONTEND_CSP: () => frontendCsp,
  ORIGIN_HOST: () => pulumi.interpolate`${frontendBucketName}.s3.${region}.scw.cloud`,
});
