/** Thin renderer for the baked TypeScript boot agent launcher. */
import { renderAgentCloudInit } from './cloud-init-agent'
import type { CloudInitParams } from './cloud-init-types'

export type { CloudInitParams }

/** Render the first-boot cloud-init script for a single service generation VM. */
export function renderCloudInit(p: CloudInitParams): string {
  return renderAgentCloudInit(p)
}