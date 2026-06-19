export interface CloudInitParams {
  /** Service name (backend, cdc, yjs, ai, frontend). */
  service: string
  /** Docker compose profile to bring up (equals the service slug). */
  profile: string
  /** Run the one-shot `migrate` companion before the app (expand-before-cutover). */
  runMigrate: boolean
  /** Release SHA baked into this generation (also the compose image tag). */
  releaseSha: string
  /** Fully-resolved static .env body written to /opt/app/.env (includes `<SVC>_TAG`). */
  envFileContent: string
  /** Runtime secret manifest JSON (metadata only) written to /etc/runtime-secrets/manifest.json. */
  manifestContent: string
  /** compose.yml body written to /opt/app/compose.yml. */
  composeContent: string
  /** Registry endpoint (`<host>/<namespace>`); login uses the host part. */
  registry: string
  /** Scaleway secret key: registry password + Secret Manager access token. */
  secretKey: string
  /** Scaleway access key for writing boot diagnostics to Object Storage. */
  accessKey: string
  /** Scaleway region for the Secret Manager endpoint. */
  region: string
  /** Dedicated Object Storage bucket for boot diagnostics. */
  bootDiagBucket: string
}
