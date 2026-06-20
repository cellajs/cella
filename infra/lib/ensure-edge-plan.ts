/**
 * Ensure the Scaleway project is subscribed to an Edge Services plan.
 * Edge Services pipelines (e.g. the frontend CDN) require an active
 * subscription, and the plan is not modelled as a Pulumi resource — so we
 * PATCH `/current-plan` once via the API before `pulumi up`.
 *
 * Idempotent: GET /current-plan first and skip if already subscribed.
 */

import { checkMark, tildeMark } from 'shared/console'
import { resolveProjectId } from './bootstrap-scw-env'
import { isMain } from './is-main'

const EDGE_BASE = 'https://api.scaleway.com/edge-services/v1beta1'

export type EdgePlanName = 'starter' | 'professional' | 'advanced'

interface CurrentPlanResponse {
  plan_name?: string
}

export async function ensureEdgePlan(opts: {
  secretKey: string
  projectId: string
  planName?: EdgePlanName
}): Promise<{ changed: boolean; planName: string }> {
  const planName = opts.planName ?? 'starter'
  const headers = { 'X-Auth-Token': opts.secretKey, 'Content-Type': 'application/json' }

  const current = await fetch(`${EDGE_BASE}/current-plan/${opts.projectId}`, { headers })
  if (current.ok) {
    const body = (await current.json()) as CurrentPlanResponse
    if (body.plan_name && body.plan_name !== 'unknown_name') {
      console.info(`  ${tildeMark} Edge Services plan already active: ${body.plan_name}`)
      return { changed: false, planName: body.plan_name }
    }
  } else if (current.status !== 404) {
    throw new Error(`GET current-plan failed: ${current.status} ${await current.text()}`)
  }

  const res = await fetch(`${EDGE_BASE}/current-plan`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ project_id: opts.projectId, plan_name: planName }),
  })
  if (!res.ok) throw new Error(`PATCH current-plan failed: ${res.status} ${await res.text()}`)
  console.info(`  ${checkMark} Subscribed to Edge Services "${planName}" plan`)
  return { changed: true, planName }
}

// Standalone CLI usage: SCW_SECRET_KEY + SCW_PROJECT_ID required.
if (isMain(import.meta.url)) {
  const secretKey = process.env.SCW_SECRET_KEY
  const projectId = resolveProjectId()
  if (!secretKey || !projectId) {
    console.error('SCW_SECRET_KEY and SCW_PROJECT_ID required')
    process.exit(1)
  }
  ensureEdgePlan({ secretKey, projectId }).catch((err) => {
    console.error((err as Error).message)
    process.exit(1)
  })
}
