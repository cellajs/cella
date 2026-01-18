import { env } from '#/env';
import { logEvent } from '#/utils/logger';

/**
 * Scaleway Edge Services API client.
 * Edge Services provides CDN, SSL certificates, and routing for static sites.
 *
 * Note: As of 2024, Edge Services API may require using the Scaleway SDK
 * or direct REST calls. This implementation provides the interface.
 */

const EDGE_API_BASE = 'https://api.scaleway.com/edge-services/v1alpha1';

/** API response types for Scaleway Edge Services */
interface ApiPipelineResponse {
  id: string;
  name: string;
  description?: string;
  status: string;
  project_id: string;
  dns_stage_id?: string;
  cache_stage_id?: string;
  backend_stage_id?: string;
  tls_stage_id?: string;
  created_at: string;
  updated_at: string;
}

interface ApiDnsStageResponse {
  id: string;
  fqdns: string[];
  tls_stage_id?: string;
  pipeline_id: string;
}

interface ApiBackendStageResponse {
  id: string;
  scaleway_s3?: {
    bucket_name?: string;
    bucket_region?: string;
  };
  pipeline_id: string;
}

interface EdgePipeline {
  id: string;
  name: string;
  description?: string;
  status: 'unknown' | 'ready' | 'pending' | 'error' | 'deleting';
  projectId: string;
  dnsStageId?: string;
  cacheStageId?: string;
  backendStageId?: string;
  tlsStageId?: string;
  createdAt: string;
  updatedAt: string;
}

interface DnsStage {
  id: string;
  fqdns: string[];
  tlsStageId?: string;
  pipelineId: string;
}

interface BackendStage {
  id: string;
  s3BucketName: string;
  s3BucketRegion: string;
  pipelineId: string;
}

interface CreatePipelineRequest {
  name: string;
  description?: string;
  projectId: string;
}

interface CreateDnsStageRequest {
  pipelineId: string;
  fqdns: string[];
}

interface CreateBackendStageRequest {
  pipelineId: string;
  s3BucketName: string;
  s3BucketRegion?: string;
}

/**
 * Check if Edge Services credentials are configured
 */
export function isEdgeConfigured(): boolean {
  return !!(env.SCALEWAY_ACCESS_KEY && env.SCALEWAY_SECRET_KEY && env.SCALEWAY_PROJECT_ID);
}

/**
 * Get headers for Edge Services API requests
 */
function getHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Auth-Token': env.SCALEWAY_SECRET_KEY ?? '',
  };
}

/**
 * Create a new Edge Services pipeline
 */
export async function createPipeline(request: CreatePipelineRequest): Promise<EdgePipeline> {
  const region = env.SCALEWAY_REGION ?? 'fr-par';
  const url = `${EDGE_API_BASE}/regions/${region}/pipelines`;

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      name: request.name,
      description: request.description,
      project_id: request.projectId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logEvent('error', 'Failed to create Edge pipeline', { error, status: response.status });
    throw new Error(`Failed to create pipeline: ${error}`);
  }

  const pipeline = (await response.json()) as ApiPipelineResponse;
  logEvent('info', 'Edge pipeline created', { pipelineId: pipeline.id });

  return {
    id: pipeline.id,
    name: pipeline.name,
    description: pipeline.description,
    status: pipeline.status as EdgePipeline['status'],
    projectId: pipeline.project_id,
    createdAt: pipeline.created_at,
    updatedAt: pipeline.updated_at,
  };
}

/**
 * Get an Edge Services pipeline by ID
 */
export async function getPipeline(pipelineId: string): Promise<EdgePipeline | null> {
  const region = env.SCALEWAY_REGION ?? 'fr-par';
  const url = `${EDGE_API_BASE}/regions/${region}/pipelines/${pipelineId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get pipeline: ${error}`);
  }

  const pipeline = (await response.json()) as ApiPipelineResponse;
  return {
    id: pipeline.id,
    name: pipeline.name,
    description: pipeline.description,
    status: pipeline.status as EdgePipeline['status'],
    projectId: pipeline.project_id,
    dnsStageId: pipeline.dns_stage_id,
    cacheStageId: pipeline.cache_stage_id,
    backendStageId: pipeline.backend_stage_id,
    tlsStageId: pipeline.tls_stage_id,
    createdAt: pipeline.created_at,
    updatedAt: pipeline.updated_at,
  };
}

/**
 * Delete an Edge Services pipeline
 */
export async function deletePipeline(pipelineId: string): Promise<void> {
  const region = env.SCALEWAY_REGION ?? 'fr-par';
  const url = `${EDGE_API_BASE}/regions/${region}/pipelines/${pipelineId}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Failed to delete pipeline: ${error}`);
  }

  logEvent('info', 'Edge pipeline deleted', { pipelineId });
}

/**
 * Create a DNS stage for custom domains
 */
export async function createDnsStage(request: CreateDnsStageRequest): Promise<DnsStage> {
  const region = env.SCALEWAY_REGION ?? 'fr-par';
  const url = `${EDGE_API_BASE}/regions/${region}/dns-stages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      pipeline_id: request.pipelineId,
      fqdns: request.fqdns,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create DNS stage: ${error}`);
  }

  const stage = (await response.json()) as ApiDnsStageResponse;
  logEvent('info', 'DNS stage created', { stageId: stage.id, fqdns: request.fqdns });

  return {
    id: stage.id,
    fqdns: stage.fqdns,
    tlsStageId: stage.tls_stage_id,
    pipelineId: stage.pipeline_id,
  };
}

/**
 * Update DNS stage with new FQDNs
 */
export async function updateDnsStage(stageId: string, fqdns: string[]): Promise<DnsStage> {
  const region = env.SCALEWAY_REGION ?? 'fr-par';
  const url = `${EDGE_API_BASE}/regions/${region}/dns-stages/${stageId}`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ fqdns }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update DNS stage: ${error}`);
  }

  const stage = (await response.json()) as ApiDnsStageResponse;
  logEvent('info', 'DNS stage updated', { stageId, fqdns });

  return {
    id: stage.id,
    fqdns: stage.fqdns,
    tlsStageId: stage.tls_stage_id,
    pipelineId: stage.pipeline_id,
  };
}

/**
 * Create a backend stage pointing to S3 bucket
 */
export async function createBackendStage(request: CreateBackendStageRequest): Promise<BackendStage> {
  const region = env.SCALEWAY_REGION ?? 'fr-par';
  const url = `${EDGE_API_BASE}/regions/${region}/backend-stages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      pipeline_id: request.pipelineId,
      scaleway_s3: {
        bucket_name: request.s3BucketName,
        bucket_region: request.s3BucketRegion ?? region,
        is_website: true,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create backend stage: ${error}`);
  }

  const stage = (await response.json()) as ApiBackendStageResponse;
  logEvent('info', 'Backend stage created', { stageId: stage.id, bucketName: request.s3BucketName });

  return {
    id: stage.id,
    s3BucketName: stage.scaleway_s3?.bucket_name ?? '',
    s3BucketRegion: stage.scaleway_s3?.bucket_region ?? '',
    pipelineId: stage.pipeline_id,
  };
}

/**
 * Update backend stage to serve from a specific S3 path
 * Used when deploying a new version to point to the new deployment folder
 */
export async function updateBackendStage(
  stageId: string,
  s3BucketName: string,
  s3Path?: string,
): Promise<BackendStage> {
  const region = env.SCALEWAY_REGION ?? 'fr-par';
  const url = `${EDGE_API_BASE}/regions/${region}/backend-stages/${stageId}`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({
      scaleway_s3: {
        bucket_name: s3BucketName,
        bucket_region: region,
        is_website: true,
        // The S3 path prefix for this deployment
        base_path: s3Path ?? '',
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update backend stage: ${error}`);
  }

  const stage = (await response.json()) as ApiBackendStageResponse;
  logEvent('info', 'Backend stage updated', { stageId: stage.id, s3Path });

  return {
    id: stage.id,
    s3BucketName: stage.scaleway_s3?.bucket_name ?? '',
    s3BucketRegion: stage.scaleway_s3?.bucket_region ?? '',
    pipelineId: stage.pipeline_id,
  };
}

/**
 * Purge cache for a pipeline
 */
export async function purgeCache(pipelineId: string, paths?: string[]): Promise<void> {
  const region = env.SCALEWAY_REGION ?? 'fr-par';
  const url = `${EDGE_API_BASE}/regions/${region}/pipelines/${pipelineId}/purge-requests`;

  const body: Record<string, unknown> = { all: true };
  if (paths && paths.length > 0) {
    body.all = false;
    body.assets = paths;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to purge cache: ${error}`);
  }

  logEvent('info', 'Cache purged', { pipelineId, paths: paths ?? ['all'] });
}

/**
 * Get the default Edge Services domain for a pipeline
 */
export function getDefaultEdgeDomain(pipelineId: string): string {
  const suffix = env.SCALEWAY_EDGE_DOMAIN ?? 'edge.scw.cloud';
  return `${pipelineId}.${suffix}`;
}

/**
 * Set up a complete Edge Services configuration for a repository
 */
export async function setupEdgeServices(
  name: string,
  s3BucketName: string,
  customDomains?: string[],
): Promise<{
  pipelineId: string;
  defaultDomain: string;
  dnsStageId?: string;
}> {
  const projectId = env.SCALEWAY_PROJECT_ID;
  if (!projectId) {
    throw new Error('SCALEWAY_PROJECT_ID not configured');
  }

  // Create pipeline
  const pipeline = await createPipeline({
    name,
    description: `Static site hosting for ${name}`,
    projectId,
  });

  // Create backend stage for S3
  await createBackendStage({
    pipelineId: pipeline.id,
    s3BucketName,
  });

  // Create DNS stage if custom domains provided
  let dnsStageId: string | undefined;
  if (customDomains && customDomains.length > 0) {
    const dnsStage = await createDnsStage({
      pipelineId: pipeline.id,
      fqdns: customDomains,
    });
    dnsStageId = dnsStage.id;
  }

  const defaultDomain = getDefaultEdgeDomain(pipeline.id);

  logEvent('info', 'Edge Services setup complete', {
    pipelineId: pipeline.id,
    defaultDomain,
    customDomains,
  });

  return {
    pipelineId: pipeline.id,
    defaultDomain,
    dnsStageId,
  };
}
