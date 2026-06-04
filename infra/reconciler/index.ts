/**
 * Reconciler glue — what cloud-init needs to install + configure the
 * per-VM reconciler that watches its service's deploy tag in S3.
 *
 * The shell script, systemd unit, and timer are co-located in this folder
 * as plain text files. This module reads them at build time and exposes
 * them as strings so the Pulumi cloud-init template can splat them into
 * heredocs without each module re-implementing path resolution or escaping.
 *
 * It also owns the per-service knobs (health port + compose profile + tag
 * key) so every consumer agrees on layout.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const read = (file: string): string => readFileSync(join(here, file), 'utf-8')

/** Bash script — installed as `/usr/local/bin/reconciler`. */
export const reconcilerScript = read('reconciler.sh')

/** Systemd unit — installed as `/etc/systemd/system/reconciler.service`. */
export const reconcilerService = read('reconciler.service')

/** Systemd timer — installed as `/etc/systemd/system/reconciler.timer`. */
export const reconcilerTimer = read('reconciler.timer')

/** Services that ship as their own image; kept in lockstep with deploy-tags.ts. */
export const reconcilerServices = ['backend', 'cdc', 'yjs', 'ai', 'frontend'] as const
export type ReconcilerService = (typeof reconcilerServices)[number]

/**
 * Per-service knobs. The compose profile and health port mirror
 * `infra/compose.yml`; keep them aligned. Promoting these to a single
 * source of truth (e.g. a TS export from compose generation) is a future
 * cleanup once compose.yml itself becomes generated.
 */
interface ServiceShape {
  composeProfile: string
  healthPort: number
  /**
   * Seconds the reconciler waits for the new container to answer /health with
   * the desired X-App-Version before rolling back. The backend image is heavy
   * (it runs migrations + warmup on boot today), so it needs a larger budget
   * than the lightweight services — too tight a window causes a rollback loop.
   * ai reuses the backend image, so it gets the same budget.
   */
  healthTimeoutSeconds: number
  /**
   * When true, the reconciler runs the one-shot `migrate` compose service to
   * apply schema migrations BEFORE rolling this service's app container
   * (expand-before-rollover). Only the backend owns the schema; ai reuses the
   * backend image but must NOT migrate (it is a worker that waits for the API).
   */
  runMigrate: boolean
  /**
   * How the reconciler rolls this service:
   *  - 'in-place'   — recreate the single app container behind the ingress.
   *  - 'blue-green' — run two named slots (`<svc>-blue` / `<svc>-green`) and
   *    flip the ingress upstream between them. The idle slot is brought up on
   *    the new tag and identity-gated BEFORE any traffic moves, so a bad
   *    release never replaces the serving container.
   * Only the backend opts into blue-green today (stateless + critical, and it
   * owns migrations); the lighter services keep the simpler in-place roll. cdc
   * is a singleton (one replication slot) and could never run two slots.
   * See infra/INFRA_ARCHITECTURE.md (Zero-downtime deploys).
   */
  rolloverStrategy: 'in-place' | 'blue-green'
  /**
   * For blue-green services only: seconds the old slot keeps serving in-flight
   * requests AFTER the ingress has flipped to the new slot, before the old slot
   * is stopped. Lets long-ish requests drain on the retired slot. 0 for the
   * in-place services (unused).
   */
  drainSeconds: number
}

const serviceMatrix: Record<ReconcilerService, ServiceShape> = {
  backend:  { composeProfile: 'backend',  healthPort: 4000, healthTimeoutSeconds: 240, runMigrate: true,  rolloverStrategy: 'blue-green', drainSeconds: 10 },
  cdc:      { composeProfile: 'cdc',      healthPort: 4001, healthTimeoutSeconds: 90,  runMigrate: false, rolloverStrategy: 'in-place',   drainSeconds: 0  },
  yjs:      { composeProfile: 'yjs',      healthPort: 4002, healthTimeoutSeconds: 90,  runMigrate: false, rolloverStrategy: 'in-place',   drainSeconds: 0  },
  ai:       { composeProfile: 'ai',       healthPort: 4003, healthTimeoutSeconds: 240, runMigrate: false, rolloverStrategy: 'in-place',   drainSeconds: 0  },
  frontend: { composeProfile: 'frontend', healthPort: 80,   healthTimeoutSeconds: 90,  runMigrate: false, rolloverStrategy: 'in-place',   drainSeconds: 0  },
}

export interface ReconcilerEnvInput {
  service: ReconcilerService
  tagBucket: string
  region: string
  registry: string
  /**
   * Pulumi state bucket — the reconciler uploads a failed slot's logs to its
   * `boot-diag/` prefix so CI (fetch-boot-diag) can surface WHY a release
   * failed its health gate without SSH. Optional for back-compat with older
   * VMs; the script no-ops the upload when empty.
   */
  stateBucket: string
  /** Read-only S3 credentials scoped to `deploy/<service>.tag`. */
  awsAccessKeyId: string
  awsSecretAccessKey: string
}

/**
 * Render the EnvironmentFile contents for /etc/reconciler/reconciler.env.
 *
 * One file per VM; cloud-init writes it with mode 0600. Values are
 * single-quoted bash literals — backslashes and single quotes are not
 * expected in any of these inputs (UUID-ish identifiers, bucket names,
 * base64 credentials) but we still escape them to avoid silent breakage
 * if Scaleway ever changes credential formatting.
 */
export function buildReconcilerEnv(input: ReconcilerEnvInput): string {
  const shape = serviceMatrix[input.service]
  if (!shape) throw new Error(`unknown reconciler service: ${input.service}`)

  const pairs: Array<[string, string]> = [
    ['SERVICE',               input.service],
    ['COMPOSE_PROFILE',       shape.composeProfile],
    ['HEALTH_PORT',           String(shape.healthPort)],
    ['HEALTH_TIMEOUT_SECONDS', String(shape.healthTimeoutSeconds)],
    ['RUN_MIGRATE',           shape.runMigrate ? '1' : '0'],
    ['ROLLOVER_STRATEGY',     shape.rolloverStrategy],
    ['DRAIN_SECONDS',         String(shape.drainSeconds)],
    ['TAG_BUCKET',            input.tagBucket],
    ['TAG_KEY',               `deploy/${input.service}.tag`],
    ['STATE_BUCKET',          input.stateBucket],
    ['REGION',                input.region],
    ['REGISTRY',              input.registry],
    ['AWS_ACCESS_KEY_ID',     input.awsAccessKeyId],
    ['AWS_SECRET_ACCESS_KEY', input.awsSecretAccessKey],
  ]

  const escape = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`
  return pairs.map(([k, v]) => `${k}=${escape(v)}`).join('\n') + '\n'
}

/**
 * Shell snippet that writes the reconciler files and enables the timer.
 * Embedded into cloud-init via heredoc; the caller is responsible for
 * also writing /etc/reconciler/reconciler.env (built by `buildReconcilerEnv`)
 * because that file contains per-VM secrets and must use cloud-init's own
 * variable interpolation.
 *
 * The script + units are written via base64 to sidestep heredoc nesting:
 * cloud-init is itself a heredoc inside Pulumi, this script ships embedded
 * heredocs of its own, and at some point the quoting boundaries pile up
 * enough to be a bug factory.
 */
export function buildInstallSnippet(): string {
  const enc = (s: string) => Buffer.from(s, 'utf-8').toString('base64')
  return [
    'mkdir -p /etc/reconciler /var/lib/reconciler /var/log/reconciler',
    `echo '${enc(reconcilerScript)}' | base64 -d > /usr/local/bin/reconciler`,
    'chmod 0755 /usr/local/bin/reconciler',
    `echo '${enc(reconcilerService)}' | base64 -d > /etc/systemd/system/reconciler.service`,
    `echo '${enc(reconcilerTimer)}' | base64 -d > /etc/systemd/system/reconciler.timer`,
    // The env file is written by the caller — bail loudly if it isn't there
    // when we try to enable the timer, instead of silently shipping a broken VM.
    'test -r /etc/reconciler/reconciler.env || { echo "reconciler.env missing" >&2; exit 1; }',
    'chmod 0600 /etc/reconciler/reconciler.env',
    'systemctl daemon-reload',
    'systemctl enable --now reconciler.timer',
  ].join('\n')
}
