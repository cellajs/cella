import {
  type BootPlan,
  parseRuntimeSecretManifest,
  supportedImageContract,
  supportedSchemaVersion,
} from '../boot/src/plan';

export interface CloudInitParams {
  /** App slug: namespaces the VM's `/etc/<slug>` config dir and serial markers. */
  slug: string;
  /** Service name (the compose profile slug). */
  service: string;
  /** Docker compose profile to bring up (equals the service slug). */
  profile: string;
  /** Compose services the boot runner starts (the service plus any collocated containers). */
  startServices: string[];
  /** Run the one-shot release companion before the app (expand-before-cutover). */
  runRelease: boolean;
  /** Release SHA baked into this generation (also the compose image tag). */
  releaseSha: string;
  /** Fully-resolved static .env body written to /opt/app/.env (includes `<SVC>_TAG`). */
  envFileContent: string;
  /** Runtime secret manifest JSON (metadata only) written to /etc/runtime-secrets/manifest.json. */
  manifestContent: string;
  /** compose.yml body written to /opt/app/compose.yml. */
  composeContent: string;
  /** Registry endpoint (`<host>/<namespace>`); login uses the host part. */
  registry: string;
  /**
   * Boot runner image repository name the digest below resolved under; the
   * digest is only pullable from that repository, so the ref must use it.
   * Defaults to the current name.
   */
  bootImageName?: string;
  /**
   * Manifest digest (`sha256:…`) the boot runner tag resolved to at plan time.
   * When set, the launcher runs the boot image by digest, so a later registry
   * push cannot swap the root-equivalent (socket-mounted) boot runner under a
   * reboot. Absent only when resolution failed during a dry run.
   */
  bootImageDigest?: string;
  /** Scaleway secret key: registry password + Secret Manager access token. */
  secretKey: string;
  /** Scaleway access key for writing boot diagnostics to Object Storage. */
  accessKey: string;
  /** Scaleway region for the Secret Manager endpoint. */
  region: string;
  /** Dedicated Object Storage bucket for boot diagnostics. */
  bootDiagBucket: string;
  /** v2: single-access handoff secret id for this service's minted key. */
  handoffSecretId?: string;
  /** v2 + s3Access: export the service key as S3_* env into .env.runtime. */
  exportS3Env?: boolean;
  /** Deploy trace context baked into the boot plan (absent outside a deploy run). */
  traceparent?: string;
  /** App-declared telemetry sink for boot events (config/telemetry.config.ts). */
  telemetry?: { endpoint: string; keyHeader: string; keyEnvVar: string };
}

/** VM config paths, namespaced under `/etc/<slug>` so the engine hardcodes no app name. */
const bootPaths = (slug: string) => {
  const etcDir = `/etc/${slug}`;
  return {
    etcDir,
    accessKey: `${etcDir}/scw-access-key`,
    secretKey: `${etcDir}/scw-secret-key`,
    plan: `${etcDir}/boot-plan.json`,
    launcher: `${etcDir}/run-boot.sh`,
  };
};

const writeHeredoc = (path: string, marker: string, content: string): string => `cat > ${path} <<'${marker}'
${content}
${marker}`;

const bootHeader = (slug: string, service: string, releaseSha: string): string => `#!/bin/bash
exec > >(tee -a /var/log/infra-boot.log 2>/dev/null > /dev/console) 2>&1
set -uo pipefail
say() { echo "::${slug}:: $*" ; }
trap 'rc=$?; if [ "$rc" -ne 0 ]; then say "BOOT FAILED (exit $rc)"; fi' EXIT
say "boot start: service=${service} release=${releaseSha}"`;

const bootReplayUnit = `[Unit]
Description=Replay the first-boot log to the serial console
After=multi-user.target
[Service]
Type=oneshot
ExecStart=/bin/sh -c 'cat /var/log/infra-boot.log 2>/dev/null > /dev/console'
[Install]
WantedBy=multi-user.target`;

const installBootReplayService =
  (): string => `${writeHeredoc('/etc/systemd/system/infra-boot-replay.service', 'REPLAY_UNIT_EOF', bootReplayUnit)}
systemctl enable infra-boot-replay.service 2>&1 | tail -1`;

// -E (ERE) so `|` alternates; in a BRE the unescaped `|` is literal and the
// scrub silently matches nothing.
const scrubCloudInitLogs =
  (): string => `sed -E -i '/SECRET|PASSWORD|API_KEY|DATABASE_URL|docker login/Id' /var/log/cloud-init-output.log 2>/dev/null || true
sed -E -i '/SECRET|PASSWORD|API_KEY|DATABASE_URL|docker login/Id' /var/log/cloud-init.log 2>/dev/null || true`;

// `satisfies BootPlan` + the boot runner's own schema constants keep producer
// and consumer in lockstep: a contract change on either side fails the
// typecheck (or the manifest validation) during planning, before VM boot.
function bootPlan(p: CloudInitParams): string {
  const paths = bootPaths(p.slug);
  return JSON.stringify(
    {
      schemaVersion: supportedSchemaVersion,
      service: p.service,
      profile: p.profile,
      ...(p.startServices.length > 0 ? { services: p.startServices as [string, ...string[]] } : {}),
      releaseSha: p.releaseSha,
      ...(p.traceparent ? { traceparent: p.traceparent } : {}),
      ...(p.telemetry ? { telemetry: p.telemetry } : {}),
      imageContract: supportedImageContract,
      registry: p.registry,
      region: p.region,
      credentials: {
        scwAccessKeyFile: paths.accessKey,
        scwSecretKeyFile: paths.secretKey,
      },
      ...(p.handoffSecretId
        ? { serviceKeyHandoff: { secretId: p.handoffSecretId, cacheFile: `${paths.etcDir}/service-key.json` } }
        : {}),
      ...(p.exportS3Env ? { exportS3Env: true } : {}),
      bootDiagnostics: {
        bucket: p.bootDiagBucket,
        logFile: '/var/log/infra-boot.log',
      },
      releaseCommand: {
        enabled: p.runRelease,
        command: ['docker', 'compose', '--profile', p.profile, 'run', '--rm', `${p.profile}-release`],
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
    } satisfies BootPlan,
    null,
    2,
  );
}

/** Boot runner image reference: pinned by digest when resolved, else the release-SHA tag. */
const bootImageRef = (p: CloudInitParams): string => {
  const image = p.bootImageName ?? 'infra-boot';
  return p.bootImageDigest ? `${p.registry}/${image}@${p.bootImageDigest}` : `${p.registry}/${image}:${p.releaseSha}`;
};

/**
 * Launcher: log the host daemon into the registry (to pull the boot runner
 * image), then run the boot runner container. It drives the host Docker daemon
 * through the mounted socket and probes/reaches the private network via
 * `--network host`. /opt/app + /etc/runtime-secrets are mounted so the boot
 * runner writes compose.yml, .env, .env.runtime and the manifest to the same
 * host paths the daemon mounts.
 */
const bootLauncher = (p: CloudInitParams): string => {
  const registryHost = p.registry.split('/')[0];
  const paths = bootPaths(p.slug);
  return `#!/bin/bash
set -uo pipefail
docker login ${registryHost} -u nologin --password-stdin < ${paths.secretKey}
exec docker run --rm --network host \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -v /opt/app:/opt/app \\
  -v ${paths.etcDir}:${paths.etcDir} \\
  -v /etc/runtime-secrets:/etc/runtime-secrets \\
  ${bootImageRef(p)} \\
  boot --plan ${paths.plan}`;
};

// The systemd unit runs on first boot and each reboot. Re-running is intentional:
// the idempotent boot runner re-hydrates /opt/app/.env.runtime from Secret Manager.
const bootUnit = (launcherPath: string): string => `[Unit]
Description=Boot runner (first boot + every reboot)
After=docker.service network-online.target
Wants=docker.service network-online.target
[Service]
Type=oneshot
ExecStart=/bin/bash -lc 'set -o pipefail; ${launcherPath} 2>&1 | tee -a /var/log/infra-boot.log > /dev/console'
[Install]
WantedBy=multi-user.target`;

const writeBootInputs = (p: CloudInitParams): string => {
  const paths = bootPaths(p.slug);
  return `mkdir -p ${paths.etcDir} /opt/app /etc/runtime-secrets
${writeHeredoc(paths.plan, 'BOOT_PLAN_EOF', bootPlan(p))}
chmod 600 ${paths.plan}
${writeHeredoc(paths.accessKey, 'SCW_ACCESS_KEY_EOF', p.accessKey)}
chmod 600 ${paths.accessKey}
${writeHeredoc(paths.secretKey, 'SCW_SECRET_KEY_EOF', p.secretKey)}
chmod 600 ${paths.secretKey}
${writeHeredoc(paths.launcher, 'RUN_BOOT_EOF', bootLauncher(p))}
chmod 700 ${paths.launcher}`;
};

// `enable` wires the unit into multi-user.target so it re-runs on every reboot
// (re-hydrating runtime secrets); `start` runs it now on this first boot.
const startBootRunner = (
  p: CloudInitParams,
): string => `${writeHeredoc('/etc/systemd/system/infra-boot.service', 'INFRA_BOOT_UNIT_EOF', bootUnit(bootPaths(p.slug).launcher))}
systemctl daemon-reload
systemctl enable infra-boot.service 2>&1 | tail -1
systemctl start infra-boot.service`;

/** Render the first-boot cloud-init script for one service generation VM. */
export function renderCloudInit(p: CloudInitParams): string {
  return `${[
    bootHeader(p.slug, p.service, p.releaseSha),
    installBootReplayService(),
    writeBootInputs(p),
    startBootRunner(p),
    scrubCloudInitLogs(),
  ].join('\n\n')}\n`;
}
