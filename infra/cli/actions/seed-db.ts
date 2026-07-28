import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { confirm } from '@inquirer/prompts'
import { pc, checkMark, crossMark, warningMark } from '../../lib/utils/cli-output'
import { infraDir } from '../../lib/utils/paths'
import type { InfraContext } from '../shared'
import { convergePublicEndpoint, detectPublicIp, pulumiConfigRm, pulumiConfigSet, readDbCa, readPublicDsn } from './db-exposure'

const DB_ENDPOINT_KEY = 'infra:dbPublicEndpoint'
const DB_ACL_KEY = 'infra:dbPublicAcl'

/**
 * One guarded flow for demo data on a non-production environment: temporarily
 * expose the database to THIS machine's IP, run the backend seeds against it,
 * and close the endpoint again (also on failure). Refuses production.
 */
export async function runSeedDatabase(context: InfraContext): Promise<void> {
  if (context.environment === 'production') {
    console.error(`${crossMark} Seeding refuses to run against production.`)
    process.exit(1)
  }

  console.info(pc.dim('\nSeed database: expose to your IP -> run backend seeds -> close the endpoint.\n'))
  const detected = await detectPublicIp()
  if (!detected) {
    console.error(`${crossMark} Could not detect your public IP; use "Expose database publicly" + manual seeding instead.`)
    process.exit(1)
  }
  console.info(`Seeds run from this machine over a temporary endpoint restricted to ${pc.cyan(`${detected}/32`)}.`)
  if (!(await confirm({ message: `Seed the ${context.environment} database now?`, default: false }))) {
    console.info('Aborted; no changes made.')
    return
  }

  const { env, stack } = await convergePublicEndpoint(context, 'seed-db', (e, s) => {
    pulumiConfigSet(e, s, DB_ENDPOINT_KEY, 'true')
    pulumiConfigSet(e, s, DB_ACL_KEY, `${detected}/32`, { secret: true })
  })

  try {
    const dsn = readPublicDsn(env, stack)
    if (!dsn) throw new Error('public DSN output empty; the endpoint may still be provisioning — re-run to seed.')
    // Pin the instance CA so the seed's admin-role connection verifies the
    // server (backend's verifiedPostgresSsl upgrades to verify-full + hostname
    // pinning when DATABASE_SSL_CA is present).
    const dbCa = readDbCa(env, stack)
    if (!dbCa) console.warn(`${warningMark} DB CA output unavailable; seeding over encrypt-only TLS.`)
    console.info(pc.dim('\n-> Running backend seeds against the temporary endpoint...\n'))
    // Dev-mode env from backend/.env stays authoritative for everything except
    // the database target; seeded rows are environment-agnostic data.
    const result = spawnSync('pnpm', ['--filter', 'backend', 'seed'], {
      cwd: resolve(infraDir, '..'),
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: dsn, DATABASE_ADMIN_URL: dsn, ...(dbCa ? { DATABASE_SSL_CA: dbCa } : {}) },
    })
    if (result.status !== 0) throw new Error(`backend seed exited ${result.status}`)
    console.info(`\n${checkMark} ${pc.bold('Seeds completed.')}`)
  } finally {
    console.info(pc.dim('\n-> Closing the public endpoint...\n'))
    const closed = await convergePublicEndpoint(context, 'unseed-db', (e, s) => {
      pulumiConfigSet(e, s, DB_ENDPOINT_KEY, 'false')
      pulumiConfigRm(e, s, DB_ACL_KEY)
    }).then(
      () => true,
      (err) => {
        console.error(`${warningMark} closing the endpoint failed: ${err instanceof Error ? err.message : String(err)}`)
        return false
      },
    )
    if (closed) console.info(`${checkMark} Public endpoint closed; database is private-only again.`)
    else console.error(`${crossMark} Run "Stop public DB exposure" to close it manually.`)
  }
}
