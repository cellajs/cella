/**
 * Monitoring — Scaleway Cockpit data sources.
 *
 * Provisions the metrics + logs data sources that replace the deprecated Cockpit
 * singleton. Scaleway auto-collects metrics for managed resources (Instances, RDB,
 * LB, Object Storage) into these sources; Grafana is reached via the Scaleway
 * console using IAM credentials.
 */
import * as scaleway from '@pulumiverse/scaleway'
import { naming, region } from '../helpers'

const metricsSource = new scaleway.observability.Source('metrics-source', {
  name: `${naming.prefix}-metrics`,
  type: 'metrics',
  region,
  retentionDays: 30,
})

const logsSource = new scaleway.observability.Source('logs-source', {
  name: `${naming.prefix}-logs`,
  type: 'logs',
  region,
  retentionDays: 30,
})

/** Metrics data source ID */
export const metricsSourceId = metricsSource.id

/** Logs data source ID */
export const logsSourceId = logsSource.id
