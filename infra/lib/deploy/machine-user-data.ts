import type { Manifest } from '../../agent/src/manifest';
import { type AgentPort, type BootPlan, type ReleaseArchive, supportedImageContract, supportedSchemaVersion } from '../../agent/src/plan';
import { type CloudConfigFile, cloudConfigDocument } from '../utils/cloud-config';

/** The user data key the machine's agent polls for its manifest; `cloud-init` holds the rest. */
export const MANIFEST_KEY = 'manifest';

/** What the deploy tells a machine's agent while it runs, in the shape the agent reads it. */
export const renderManifest = (manifest: Manifest): string => JSON.stringify(manifest);

export interface MachineUserDataParams {
  /** App slug: namespaces the machine's `/etc/<slug>` config dir and serial markers. */
  slug: string;
  /** The machine's role, which is its service's slug and compose profile. */
  role: string;
  /** Compose services the agent starts (the role's plus any collocated containers). */
  startServices: [string, ...string[]];
  releaseSha: string;
  /** The machine's static `.env`, which holds no secret (lib/deploy/static-env.ts). */
  envFileContent: string;
  /** compose.yml body written to /opt/app/compose.yml. */
  composeContent: string;
  /** The agent's image, the link to its archive and that archive's sha256: the launcher loads it before Compose starts it. */
  agentImage: { image: string; url: string; sha256: string };
  /** The links the deploy signed for this machine's first boot: its env file, its boot account, the app's archives. */
  links: { env: string; bootAccount: string; archives: ReleaseArchive[] };
  /** Each service's agent port and the port its own `/health` answers on. */
  agentPorts: AgentPort[];
  /** Seconds a draining machine keeps its connections after its check turned red, before its containers stop. */
  drainSeconds: number;
  /** Deploy trace context baked into the boot plan. */
  traceparent?: string;
  /** App-declared telemetry sink for boot events (config/telemetry.config.ts). */
  telemetry?: { endpoint: string; keyHeader: string; keyEnvVar: string };
}

/**
 * Ceiling on one `compose up --wait`: the release companion (migrations, job store install, admin seed) and the start of the app together.
 * It must fail and upload its account while the deploy still waits for the machine to serve (`SERVING_TIMEOUT_SECONDS` in
 * tasks/switch-machines.ts, counted from the power-on, by which the env file and the archives are still loading), or the deploy reports a
 * failure with no account to show. The backend's own lock and statement timeouts (SERVICE=migrate) sit below it.
 */
export const composeWaitTimeoutSeconds = 240;

/** Machine config paths, namespaced under `/etc/<slug>` so the engine hardcodes no app name. */
const machinePaths = (slug: string) => {
  const etcDir = `/etc/${slug}`;
  return {
    etcDir,
    plan: `${etcDir}/boot-plan.json`,
    launcher: `${etcDir}/run-agent.sh`,
    firstBoot: `${etcDir}/first-boot.sh`,
    // systemd EnvironmentFile carrying the agent image and its archive, so the launcher interpolates no per-deploy value into shell.
    agentEnv: `${etcDir}/agent.env`,
  };
};

/**
 * The machine's boot log: the first-boot script and the agent unit append to it, the serial console replays it, and the agent reads it,
 * mounted read-only at the same path, into every boot account.
 */
const bootLogPath = '/var/log/infra-boot.log';

/** The metadata service, which hands a root process on the machine its user data: the links, until the deploy strips them, and the manifest. */
const metadataAddress = '169.254.42.42';

// -E (ERE) so `|` alternates: in a BRE the unescaped `|` is literal and the scrub matches nothing.
const scrubPattern = 'SECRET|PASSWORD|API_KEY|DATABASE_URL|X-Amz-Signature';

/**
 * The first-boot script cloud-init runs: the serial console marker `::<slug>:: boot start`, then the replay and agent units, then the log
 * scrub. The role and release travel in the boot plan (JSON) and the agent logs them itself, so no per-deploy value is interpolated into a
 * bash command position. `slug` is validated kebab-case at the config boundary (config/engine-config.ts).
 */
const firstBootScript = (slug: string): string => `#!/bin/bash
exec > >(tee -a ${bootLogPath} 2>/dev/null > /dev/console) 2>&1
set -uo pipefail
say() { echo "::${slug}:: $*" ; }
say "boot start"
systemctl daemon-reload
systemctl enable infra-boot-replay.service 2>&1 | tail -1
# Enabled so it runs on every reboot; started for this first boot.
systemctl enable infra-agent.service 2>&1 | tail -1
systemctl start infra-agent.service
sed -E -i '/${scrubPattern}/Id' /var/log/cloud-init-output.log 2>/dev/null || true
sed -E -i '/${scrubPattern}/Id' /var/log/cloud-init.log 2>/dev/null || true`;

const bootReplayUnit = `[Unit]
Description=Replay the first-boot log to the serial console
After=multi-user.target
[Service]
Type=oneshot
ExecStart=/bin/sh -c 'cat ${bootLogPath} 2>/dev/null > /dev/console'
[Install]
WantedBy=multi-user.target`;

// `satisfies BootPlan` plus the agent's schema constants fail the typecheck at planning time when either side changes the contract.
function bootPlan(p: MachineUserDataParams): string {
  return JSON.stringify(
    {
      schemaVersion: supportedSchemaVersion,
      service: p.role,
      profile: p.role,
      services: p.startServices,
      releaseSha: p.releaseSha,
      ...(p.traceparent ? { traceparent: p.traceparent } : {}),
      ...(p.telemetry ? { telemetry: p.telemetry } : {}),
      imageContract: supportedImageContract,
      links: p.links,
      bootDiagnostics: { logFile: bootLogPath },
      docker: { composeFile: '/opt/app/compose.yml' },
      agent: { ports: p.agentPorts, drainSeconds: p.drainSeconds },
      timeouts: { privateNetworkSeconds: 150, fetchAttempts: 12, fetchRetrySeconds: 10, composeWaitSeconds: composeWaitTimeoutSeconds },
    } satisfies BootPlan,
    null,
    2,
  );
}

/**
 * The agent image and its archive for the launcher's systemd EnvironmentFile. systemd parses `KEY=value` without shell evaluation, so a
 * value can never reach a bash command context; the launcher then references them quoted.
 */
const agentEnvContent = (p: MachineUserDataParams): string =>
  `AGENT_IMAGE=${p.agentImage.image}\nAGENT_ARCHIVE_SHA256=${p.agentImage.sha256}\nAGENT_ARCHIVE_URL=${p.agentImage.url}`;

/**
 * Load the agent from its archive when the daemon lacks it, refusing an archive whose sha256 differs, then start it as the `infra-agent`
 * Compose service, attached so its output reaches the boot log and the serial console. Compose runs from the agent's own image, which
 * carries the CLI the machine's image may lack. The unit runs it at every boot, so the rule that keeps app containers off the metadata
 * service is set here, before any container starts, in DOCKER-USER, the one chain Docker consults before its own rules; the agent is on
 * the host network, which the rule leaves alone. A rule that cannot be set ends the boot.
 */
const launcher = `#!/bin/bash
set -uo pipefail
iptables -C DOCKER-USER -d ${metadataAddress} -j DROP 2>/dev/null || iptables -I DOCKER-USER -d ${metadataAddress} -j DROP || exit 1
if ! docker image inspect "$AGENT_IMAGE" >/dev/null 2>&1; then
  mkdir -p /opt/app/images
  curl -fsS --max-time 240 --retry 5 --retry-all-errors -o /opt/app/images/agent.tar "$AGENT_ARCHIVE_URL" || { echo "the agent archive could not be fetched"; exit 1; }
  if ! echo "$AGENT_ARCHIVE_SHA256  /opt/app/images/agent.tar" | sha256sum -c --status; then
    rm -f /opt/app/images/agent.tar
    echo "the agent archive differs from its digest: refused"
    exit 1
  fi
  docker load --quiet --input /opt/app/images/agent.tar || exit 1
  rm -f /opt/app/images/agent.tar
fi
touch ${bootLogPath}
exec docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v /opt/app:/opt/app --entrypoint docker "$AGENT_IMAGE" \\
  compose --project-directory /opt/app --file /opt/app/compose.yml --profile agent up --no-log-prefix --exit-code-from infra-agent infra-agent`;

// The unit runs on first boot and each reboot: a reboot runs the kept env file and the loaded images again, and fetches nothing. The agent
// runs as long as the machine does, so the unit restarts it when it stops.
const agentUnit = (launcherPath: string, agentEnvPath: string): string => `[Unit]
Description=infra-agent (boot, health checks, drain)
After=docker.service network-online.target
Wants=docker.service network-online.target
[Service]
Type=simple
EnvironmentFile=${agentEnvPath}
ExecStart=/bin/bash -lc 'set -o pipefail; ${launcherPath} 2>&1 | tee -a ${bootLogPath} > /dev/console'
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target`;

/**
 * Render the `#cloud-config` user data of one machine: the compose file and its static env, the boot plan, the launcher and its units,
 * written before anything runs, then the first-boot script. It holds links and the plan, never a key or a secret value.
 */
export function renderMachineUserData(p: MachineUserDataParams): string {
  const paths = machinePaths(p.slug);
  const files: CloudConfigFile[] = [
    { path: '/opt/app/compose.yml', permissions: '0600', content: p.composeContent },
    { path: '/opt/app/.env', permissions: '0600', content: p.envFileContent },
    { path: paths.plan, permissions: '0600', content: bootPlan(p) },
    { path: paths.agentEnv, permissions: '0600', content: agentEnvContent(p) },
    { path: paths.launcher, permissions: '0700', content: launcher },
    { path: paths.firstBoot, permissions: '0700', content: firstBootScript(p.slug) },
    { path: '/etc/systemd/system/infra-agent.service', permissions: '0644', content: agentUnit(paths.launcher, paths.agentEnv) },
    { path: '/etc/systemd/system/infra-boot-replay.service', permissions: '0644', content: bootReplayUnit },
  ];
  return cloudConfigDocument(files, [paths.firstBoot]);
}
