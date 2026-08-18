import * as pulumi from '@pulumi/pulumi';
import { defineEnvSuppliers } from '../lib/env-suppliers';
import { region, serviceUrl } from '../pulumi-context';
import { frontendBucketName } from '../resources/storage';
import { frontendCsp } from './frontend-csp.config';

/** App-owned suppliers for app-wide compose `${VAR}` placeholders that are not service-to-service bindings, which are declared as `bindings` on the service registry entry. */
export const appEnvSuppliers = defineEnvSuppliers({
  FRONTEND_URL: () => serviceUrl('frontend'),
  BACKEND_URL: () => serviceUrl('backend'),
  FRONTEND_CSP: () => frontendCsp,
  ORIGIN_HOST: () => pulumi.interpolate`${frontendBucketName}.s3.${region}.scw.cloud`,
});
