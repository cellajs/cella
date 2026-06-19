import type { CloudInitParams } from './cloud-init-types'

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

const agentUnit = `[Unit]
Description=Cella first-boot agent
After=docker.service network-online.target
Wants=docker.service network-online.target
[Service]
Type=oneshot
ExecStart=/bin/bash -lc 'set -o pipefail; /usr/local/bin/cella-boot-agent boot --plan ${agentPlanPath} 2>&1 | tee -a /var/log/cella-boot.log > /dev/console'
[Install]
WantedBy=multi-user.target`

const writeAgentInputs = (p: CloudInitParams): string => `mkdir -p /etc/cella
${writeHeredoc(agentPlanPath, 'BOOT_PLAN_EOF', bootPlan(p))}
chmod 600 ${agentPlanPath}
${writeHeredoc(agentAccessKeyPath, 'SCW_ACCESS_KEY_EOF', p.accessKey)}
chmod 600 ${agentAccessKeyPath}
${writeHeredoc(agentSecretKeyPath, 'SCW_SECRET_KEY_EOF', p.secretKey)}
chmod 600 ${agentSecretKeyPath}`

const startAgent = (): string => `${writeHeredoc('/etc/systemd/system/cella-boot-agent.service', 'CELLA_BOOT_AGENT_UNIT_EOF', agentUnit)}
systemctl daemon-reload
systemctl start cella-boot-agent.service`

export function renderAgentCloudInit(p: CloudInitParams): string {
  return [
    bootHeader(p.service, p.releaseSha),
    installBootReplayService(),
    writeAgentInputs(p),
    startAgent(),
    scrubCloudInitLogs(),
  ].join('\n\n') + '\n'
}
