import * as pulumi from '@pulumi/pulumi'
import { defineEnvSuppliers } from '../lib/env-suppliers'
import { frontendCsp } from '../lib/frontend-csp'
import { region, serviceUrl } from '../pulumi-context'
import { frontendBucketName } from '../resources/storage'

/**
 * Fork-owned suppliers for the app-wide compose `${VAR}` placeholders that are
 * not service-to-service bindings. Service-specific wiring is declared as
 * `bindings` on the service registry entry; these are the shared values.
 *
 * `FRONTEND_URL` / `BACKEND_URL` come from the endpoint registry by slug;
 * `FRONTEND_CSP` and `ORIGIN_HOST` are the SPA proxy's CSP header and the S3
 * REST hostname it fronts.
 */
export const appEnvSuppliers = defineEnvSuppliers({
  FRONTEND_URL: () => serviceUrl('frontend'),
  BACKEND_URL: () => serviceUrl('backend'),
  FRONTEND_CSP: () => frontendCsp,
  ORIGIN_HOST: () => pulumi.interpolate`${frontendBucketName}.s3.${region}.scw.cloud`,
})
