import { type BootPlan, type ReleaseArchive, supportedImageContract, supportedSchemaVersion } from '../boot/src/plan';
import { type CloudConfigFile, cloudConfigDocument } from '../lib/utils/cloud-config';

export interface CloudInitParams {
  /** App slug: namespaces the VM's `/etc/<slug>` config dir and serial markers. */
  slug: string;
  /** Service name (the compose profile slug). */
  service: string;
  /** Docker compose profile to bring up (equals the service slug). */
  profile: string;
  /** Compose services the boot runner starts (the service plus any collocated containers). */
  startServices: [string, ...string[]];
  /** Release SHA baked into this generation (also the compose image tag). */
  releaseSha: string;
  /** Fully-resolved static .env body written to /opt/app/.env (includes `<SVC>_TAG`); it holds no secret. */
  envFileContent: string;
  /** compose.yml body written to /opt/app/compose.yml. */
  composeContent: string;
  /** The boot runner's image, the link to its archive and that archive's sha256: the launcher loads it before it runs it. */
  bootImage: { image: string; url: string; sha256: string };
  /** The links the deploy signed for this machine's first boot: its env file, its boot account, the app's archives. */
  links: { env: string; bootAccount: string; archives: ReleaseArchive[] };
  /** Deploy trace context baked into the boot plan (absent outside a deploy run). */
  traceparent?: string;
  /** App-declared telemetry sink for boot events (config/telemetry.config.ts). */
  telemetry?: { endpoint: string; keyHeader: string; keyEnvVar: string };
}

/**
 * Ceiling on one `compose up --wait`: the release companion (migrations, job store install, admin seed) and the start of the app together.
 * It must fail and upload its diagnostics while the deploy's health gate still polls (`deployHealthGateSeconds`, counted from the end of the
 * provisioning update, by which the env file and the archives are still loading), or the deploy reports a failure with no account to show.
 * The backend's own lock and statement timeouts (SERVICE=migrate) sit below it.
 */
export const composeWaitTimeoutSeconds = 240;

/** VM config paths, namespaced under `/etc/<slug>` so the engine hardcodes no app name. */
const bootPaths = (slug: string) => {
  const etcDir = `/etc/${slug}`;
  return {
    etcDir,
    plan: `${etcDir}/boot-plan.json`,
    launcher: `${etcDir}/run-boot.sh`,
    firstBoot: `${etcDir}/first-boot.sh`,
    // systemd EnvironmentFile carrying the boot image and its archive, so the launcher interpolates no per-deploy value into shell.
    bootEnv: `${etcDir}/boot.env`,
  };
};

/**
 * The VM's boot log: the first-boot script and the boot unit append to it, the serial console replays it, and the boot runner
 * reads it, mounted read-only at the same path, into every diagnostics bundle.
 */
const bootLogPath = '/var/log/infra-boot.log';

/** The metadata service, which hands any process on the machine its user data: the links, until the deploy strips them. */
const metadataAddress = '169.254.42.42';

// -E (ERE) so `|` alternates: in a BRE the unescaped `|` is literal and the scrub matches nothing.
const scrubPattern = 'SECRET|PASSWORD|API_KEY|DATABASE_URL|X-Amz-Signature';

/**
 * The first-boot script cloud-init runs: the serial console markers the boot-account diagnosis reads (`::<slug>:: boot start`, and
 * `BOOT FAILED` on a failure), then the replay and boot units, then the log scrub. The service name and release SHA travel in the boot plan
 * (JSON) and the boot runner logs them itself, so no per-deploy value is interpolated into a bash command position. `slug` is validated
 * kebab-case at the config boundary (config/engine-config.ts).
 */
const firstBootScript = (slug: string): string => `#!/bin/bash
exec > >(tee -a ${bootLogPath} 2>/dev/null > /dev/console) 2>&1
set -uo pipefail
say() { echo "::${slug}:: $*" ; }
trap 'rc=$?; if [ "$rc" -ne 0 ]; then say "BOOT FAILED (exit $rc)"; fi' EXIT
say "boot start"
mkdir -p /opt/app
systemctl daemon-reload
systemctl enable infra-boot-replay.service 2>&1 | tail -1
# Enabled so it runs on every reboot; started for this first boot.
systemctl enable infra-boot.service 2>&1 | tail -1
systemctl start infra-boot.service
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

// `satisfies BootPlan` plus the boot runner's schema constants fail the typecheck at planning time when either side changes the contract, before VM boot.
function bootPlan(p: CloudInitParams): string {
  return JSON.stringify(
    {
      schemaVersion: supportedSchemaVersion,
      service: p.service,
      profile: p.profile,
      services: p.startServices,
      releaseSha: p.releaseSha,
      ...(p.traceparent ? { traceparent: p.traceparent } : {}),
      ...(p.telemetry ? { telemetry: p.telemetry } : {}),
      imageContract: supportedImageContract,
      links: p.links,
      bootDiagnostics: { logFile: bootLogPath },
      docker: { composeFile: '/opt/app/compose.yml' },
      files: { compose: p.composeContent, env: p.envFileContent },
      timeouts: { privateNetworkSeconds: 150, fetchAttempts: 12, fetchRetrySeconds: 10, composeWaitSeconds: composeWaitTimeoutSeconds },
    } satisfies BootPlan,
    null,
    2,
  );
}

/**
 * The boot image and its archive for the launcher's systemd EnvironmentFile. systemd parses `KEY=value` without shell evaluation, so a value
 * can never reach a bash command context; the launcher then references them quoted, and bash parameter expansion does not re-scan a value
 * for command substitution.
 */
const bootEnvContent = (p: CloudInitParams): string =>
  `BOOT_IMAGE=${p.bootImage.image}\nBOOT_ARCHIVE_SHA256=${p.bootImage.sha256}\nBOOT_ARCHIVE_URL=${p.bootImage.url}`;

/**
 * Load the boot runner from its archive when the daemon lacks it, refusing an archive whose sha256 differs, then run it. It drives the host
 * Docker daemon through the mounted socket, reaches the private network via `--network host`, and writes its outputs to the host paths the
 * daemon mounts. The boot log is mounted read-only for the diagnostics upload; `touch` first, because Docker creates a missing bind source as
 * a directory. The unit runs it at every boot, so the rule that keeps app containers off the metadata service is set here, before any
 * container starts, in DOCKER-USER, the one chain Docker consults before its own rules; the boot runner is on the host network, which the
 * rule leaves alone. A rule that cannot be set ends the boot.
 */
const bootLauncher = (p: CloudInitParams): string => {
  const paths = bootPaths(p.slug);
  return `#!/bin/bash
set -uo pipefail
iptables -I DOCKER-USER -d ${metadataAddress} -j DROP || exit 1
if ! docker image inspect "$BOOT_IMAGE" >/dev/null 2>&1; then
  mkdir -p /opt/app/images
  curl -fsS --retry 5 --retry-all-errors -o /opt/app/images/boot-runner.tar "$BOOT_ARCHIVE_URL" || { echo "the boot runner archive could not be fetched"; exit 1; }
  if ! echo "$BOOT_ARCHIVE_SHA256  /opt/app/images/boot-runner.tar" | sha256sum -c --status; then
    rm -f /opt/app/images/boot-runner.tar
    echo "the boot runner archive differs from its digest: refused"
    exit 1
  fi
  docker load --quiet --input /opt/app/images/boot-runner.tar || exit 1
  rm -f /opt/app/images/boot-runner.tar
fi
touch ${bootLogPath}
exec docker run --rm --network host \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -v /opt/app:/opt/app \\
  -v ${paths.etcDir}:${paths.etcDir} \\
  -v ${bootLogPath}:${bootLogPath}:ro \\
  "$BOOT_IMAGE" \\
  boot --plan ${paths.plan}`;
};

// The unit runs on first boot and each reboot: a reboot runs the kept env file and the loaded images again, and fetches nothing.
const bootUnit = (launcherPath: string, bootEnvPath: string): string => `[Unit]
Description=Boot runner (first boot + every reboot)
After=docker.service network-online.target
Wants=docker.service network-online.target
[Service]
Type=oneshot
EnvironmentFile=${bootEnvPath}
ExecStart=/bin/bash -lc 'set -o pipefail; ${launcherPath} 2>&1 | tee -a ${bootLogPath} > /dev/console'
[Install]
WantedBy=multi-user.target`;

/**
 * Render the `#cloud-config` user data of one service generation VM: the boot plan, the launcher and its units, written before anything
 * runs, then the first-boot script. It holds links and the plan, never a key or a secret value.
 */
export function renderCloudInit(p: CloudInitParams): string {
  const paths = bootPaths(p.slug);
  const files: CloudConfigFile[] = [
    { path: paths.plan, permissions: '0600', content: bootPlan(p) },
    { path: paths.bootEnv, permissions: '0600', content: bootEnvContent(p) },
    { path: paths.launcher, permissions: '0700', content: bootLauncher(p) },
    { path: paths.firstBoot, permissions: '0700', content: firstBootScript(p.slug) },
    { path: '/etc/systemd/system/infra-boot.service', permissions: '0644', content: bootUnit(paths.launcher, paths.bootEnv) },
    { path: '/etc/systemd/system/infra-boot-replay.service', permissions: '0644', content: bootReplayUnit },
  ];
  return cloudConfigDocument(files, [paths.firstBoot]);
}
