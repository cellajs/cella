/**
 * First-boot cloud-init for a service generation VM. Writes the boot plan +
 * credentials + a launcher to /etc/cella, then starts a systemd oneshot that
 * `docker run`s the containerized boot agent (which drives the host Docker
 * daemon through the mounted socket to bring the service's compose stack up).
 */

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

const agentAccessKeyPath = '/etc/cella/scw-access-key'
const agentSecretKeyPath = '/etc/cella/scw-secret-key'
const agentPlanPath = '/etc/cella/boot-plan.json'

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

const scrubCloudInitLogs = (): string => `sed -i '/SECRET\|PASSWORD\|API_KEY\|DATABASE_URL\|docker login/Id' /var/log/cloud-init-output.log 2>/dev/null || true
sed -i '/SECRET\|PASSWORD\|API_KEY\|DATABASE_URL\|docker login/Id' /var/log/cloud-init.log 2>/dev/null || true`

function bootPlan(p: CloudInitParams): string {
  return JSON.stringify({
    schemaVersion: 1,
    service: p.service,
    profile: p.profile,
    releaseSha: p.releaseSha,
    imageContract: 'docker-node-agent-v1',
    registry: p.registry,
    region: p.region,
    credentials: {
      scwAccessKeyFile: agentAccessKeyPath,
      scwSecretKeyFile: agentSecretKeyPath,
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
      runtimeSecretManifest: JSON.parse(p.manifestContent) as unknown,
    },
    timeouts: {
      privateNetworkSeconds: 150,
      pullAttempts: 12,
      pullRetrySeconds: 10,
    },
  }, null, 2)
}

/** Agent image reference: same registry namespace + release SHA as the app images. */
const agentImageRef = (p: CloudInitParams): string => `${p.registry}/cella-boot-agent:${p.releaseSha}`

const agentLauncherPath = '/etc/cella/run-agent.sh'

/**
 * Launcher: log the host daemon into the registry (to pull the agent image),
 * then run the agent container. The agent drives the host Docker daemon through
 * the mounted socket and probes/reaches the private network via `--network host`.
 * /opt/app + /etc/runtime-secrets are mounted so the agent writes compose.yml,
 * .env, .env.runtime and the manifest to the same host paths the daemon mounts.
 */
const agentLauncher = (p: CloudInitParams): string => {
  const registryHost = p.registry.split('/')[0]
  return `#!/bin/bash
set -uo pipefail
docker login ${registryHost} -u nologin --password-stdin < ${agentSecretKeyPath}
exec docker run --rm --network host \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -v /opt/app:/opt/app \\
  -v /etc/cella:/etc/cella \\
  -v /etc/runtime-secrets:/etc/runtime-secrets \\
  ${agentImageRef(p)} \\
  boot --plan ${agentPlanPath}`
}

const agentUnit = `[Unit]
Description=Cella first-boot agent
After=docker.service network-online.target
Wants=docker.service network-online.target
[Service]
Type=oneshot
ExecStart=/bin/bash -lc 'set -o pipefail; ${agentLauncherPath} 2>&1 | tee -a /var/log/cella-boot.log > /dev/console'
[Install]
WantedBy=multi-user.target`

const writeAgentInputs = (p: CloudInitParams): string => `mkdir -p /etc/cella /opt/app /etc/runtime-secrets
${writeHeredoc(agentPlanPath, 'BOOT_PLAN_EOF', bootPlan(p))}
chmod 600 ${agentPlanPath}
${writeHeredoc(agentAccessKeyPath, 'SCW_ACCESS_KEY_EOF', p.accessKey)}
chmod 600 ${agentAccessKeyPath}
${writeHeredoc(agentSecretKeyPath, 'SCW_SECRET_KEY_EOF', p.secretKey)}
chmod 600 ${agentSecretKeyPath}
${writeHeredoc(agentLauncherPath, 'RUN_AGENT_EOF', agentLauncher(p))}
chmod 700 ${agentLauncherPath}`

const startAgent = (): string => `${writeHeredoc('/etc/systemd/system/cella-boot-agent.service', 'CELLA_BOOT_AGENT_UNIT_EOF', agentUnit)}
systemctl daemon-reload
systemctl start cella-boot-agent.service`

/** Render the first-boot cloud-init script for a single service generation VM. */
export function renderCloudInit(p: CloudInitParams): string {
  return [
    bootHeader(p.service, p.releaseSha),
    installBootReplayService(),
    writeAgentInputs(p),
    startAgent(),
    scrubCloudInitLogs(),
  ].join('\n\n') + '\n'
}