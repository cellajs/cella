import { type BootPlan, parseRuntimeSecretManifest, supportedImageContract, supportedSchemaVersion } from '../boot/src/plan'

export interface CloudInitParams {
  /** Service name (backend, cdc, yjs, mcp, frontend). */
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
  /**
   * Manifest digest (`sha256:…`) the boot runner tag resolved to at plan time.
   * When set, the launcher runs the boot image by digest, so a later registry
   * push cannot swap the root-equivalent (socket-mounted) boot runner under a
   * reboot. Absent only when resolution failed during a dry run.
   */
  bootImageDigest?: string
  /** Scaleway secret key: registry password + Secret Manager access token. */
  secretKey: string
  /** Scaleway access key for writing boot diagnostics to Object Storage. */
  accessKey: string
  /** Scaleway region for the Secret Manager endpoint. */
  region: string
  /** Dedicated Object Storage bucket for boot diagnostics. */
  bootDiagBucket: string
  /** Deploy trace context baked into the boot plan (absent outside a deploy run). */
  traceparent?: string
}

const accessKeyPath = '/etc/cella/scw-access-key'
const secretKeyPath = '/etc/cella/scw-secret-key'
const planPath = '/etc/cella/boot-plan.json'

const writeHeredoc = (path: string, marker: string, content: string): string => `cat > ${path} <<'${marker}'
${content}
${marker}`

const bootHeader = (service: string, releaseSha: string): string => `#!/bin/bash
exec > >(tee -a /var/log/cella-boot.log 2>/dev/null > /dev/console) 2>&1
set -uo pipefail
say() { echo "::cella:: $*" ; }
trap 'rc=$?; if [ "$rc" -ne 0 ]; then say "BOOT FAILED (exit $rc)"; fi' EXIT
say "boot start: service=${service} release=${releaseSha}"`

const bootReplayUnit = `[Unit]
Description=Replay the cella first-boot log to the serial console
After=multi-user.target
[Service]
Type=oneshot
ExecStart=/bin/sh -c 'cat /var/log/cella-boot.log 2>/dev/null > /dev/console'
[Install]
WantedBy=multi-user.target`

const installBootReplayService = (): string => `${writeHeredoc('/etc/systemd/system/cella-boot-replay.service', 'REPLAY_UNIT_EOF', bootReplayUnit)}
systemctl enable cella-boot-replay.service 2>&1 | tail -1`

// -E (ERE) so `|` alternates; in a BRE the unescaped `|` is literal and the
// scrub silently matches nothing.
const scrubCloudInitLogs = (): string => `sed -E -i '/SECRET|PASSWORD|API_KEY|DATABASE_URL|docker login/Id' /var/log/cloud-init-output.log 2>/dev/null || true
sed -E -i '/SECRET|PASSWORD|API_KEY|DATABASE_URL|docker login/Id' /var/log/cloud-init.log 2>/dev/null || true`

// `satisfies BootPlan` + the boot runner's own schema constants keep producer
// and consumer in lockstep: a contract change on either side fails the
// typecheck (or the manifest validation) during planning, before VM boot.
function bootPlan(p: CloudInitParams): string {
  return JSON.stringify({
    schemaVersion: supportedSchemaVersion,
    service: p.service,
    profile: p.profile,
    releaseSha: p.releaseSha,
    ...(p.traceparent ? { traceparent: p.traceparent } : {}),
    imageContract: supportedImageContract,
    registry: p.registry,
    region: p.region,
    credentials: {
      scwAccessKeyFile: accessKeyPath,
      scwSecretKeyFile: secretKeyPath,
    },
    bootDiagnostics: {
      bucket: p.bootDiagBucket,
      logFile: '/var/log/cella-boot.log',
    },
    releaseCommand: {
      enabled: p.runMigrate,
      command: ['docker', 'compose', '--profile', p.profile, 'run', '--rm', 'migrate'],
    },
    docker: { composeFile: '/opt/app/compose.yml' },
    files: {
      compose: p.composeContent,
      env: p.envFileContent,
      runtimeSecretManifest: parseRuntimeSecretManifest(JSON.parse(p.manifestContent)),
    },
    timeouts: {
      privateNetworkSeconds: 150,
      pullAttempts: 12,
      pullRetrySeconds: 10,
    },
  } satisfies BootPlan, null, 2)
}

/** Boot runner image reference: pinned by digest when resolved, else the release-SHA tag. */
const bootImageRef = (p: CloudInitParams): string =>
  p.bootImageDigest ? `${p.registry}/cella-boot@${p.bootImageDigest}` : `${p.registry}/cella-boot:${p.releaseSha}`

const launcherPath = '/etc/cella/run-boot.sh'

/**
 * Launcher: log the host daemon into the registry (to pull the boot runner
 * image), then run the boot runner container. It drives the host Docker daemon
 * through the mounted socket and probes/reaches the private network via
 * `--network host`. /opt/app + /etc/runtime-secrets are mounted so the boot
 * runner writes compose.yml, .env, .env.runtime and the manifest to the same
 * host paths the daemon mounts.
 */
const bootLauncher = (p: CloudInitParams): string => {
  const registryHost = p.registry.split('/')[0]
  return `#!/bin/bash
set -uo pipefail
docker login ${registryHost} -u nologin --password-stdin < ${secretKeyPath}
exec docker run --rm --network host \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -v /opt/app:/opt/app \\
  -v /etc/cella:/etc/cella \\
  -v /etc/runtime-secrets:/etc/runtime-secrets \\
  ${bootImageRef(p)} \\
  boot --plan ${planPath}`
}

// The systemd unit runs on first boot and each reboot. Re-running is intentional:
// the idempotent boot runner re-hydrates /opt/app/.env.runtime from Secret Manager.
const bootUnit = `[Unit]
Description=Cella boot runner (first boot + every reboot)
After=docker.service network-online.target
Wants=docker.service network-online.target
[Service]
Type=oneshot
ExecStart=/bin/bash -lc 'set -o pipefail; ${launcherPath} 2>&1 | tee -a /var/log/cella-boot.log > /dev/console'
[Install]
WantedBy=multi-user.target`

const writeBootInputs = (p: CloudInitParams): string => `mkdir -p /etc/cella /opt/app /etc/runtime-secrets
${writeHeredoc(planPath, 'BOOT_PLAN_EOF', bootPlan(p))}
chmod 600 ${planPath}
${writeHeredoc(accessKeyPath, 'SCW_ACCESS_KEY_EOF', p.accessKey)}
chmod 600 ${accessKeyPath}
${writeHeredoc(secretKeyPath, 'SCW_SECRET_KEY_EOF', p.secretKey)}
chmod 600 ${secretKeyPath}
${writeHeredoc(launcherPath, 'RUN_BOOT_EOF', bootLauncher(p))}
chmod 700 ${launcherPath}`

// `enable` wires the unit into multi-user.target so it re-runs on every reboot
// (re-hydrating runtime secrets); `start` runs it now on this first boot.
const startBootRunner = (): string => `${writeHeredoc('/etc/systemd/system/cella-boot.service', 'CELLA_BOOT_UNIT_EOF', bootUnit)}
systemctl daemon-reload
systemctl enable cella-boot.service 2>&1 | tail -1
systemctl start cella-boot.service`

/** Render the first-boot cloud-init script for one service generation VM. */
export function renderCloudInit(p: CloudInitParams): string {
  return [
    bootHeader(p.service, p.releaseSha),
    installBootReplayService(),
    writeBootInputs(p),
    startBootRunner(),
    scrubCloudInitLogs(),
  ].join('\n\n') + '\n'
}
