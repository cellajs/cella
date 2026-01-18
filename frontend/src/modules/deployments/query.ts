import { queryOptions } from '@tanstack/react-query';
import {
  cancelDeployment,
  getDeployment,
  getDeploymentLogs,
  listDeployments,
  rollbackDeployment,
  triggerDeployment2,
} from '~/api.gen';
import type { DeploymentStatus, LogLevel } from './types';

/** Query keys for deployments */
export const deploymentsKeys = {
  all: ['deployments'] as const,
  list: (params?: { repositoryId?: string; status?: DeploymentStatus }) =>
    [...deploymentsKeys.all, 'list', params] as const,
  detail: (deploymentId: string) => [...deploymentsKeys.all, 'detail', deploymentId] as const,
  logs: (deploymentId: string, params?: { level?: LogLevel; after?: string }) =>
    [...deploymentsKeys.all, 'logs', deploymentId, params] as const,
};

/** Query options for listing deployments */
export const deploymentsListOptions = (params?: {
  repositoryId?: string;
  status?: DeploymentStatus;
  limit?: number;
  offset?: number;
}) =>
  queryOptions({
    queryKey: deploymentsKeys.list({ repositoryId: params?.repositoryId, status: params?.status }),
    queryFn: () =>
      listDeployments({
        query: {
          q: params?.repositoryId,
          limit: params?.limit?.toString(),
          offset: params?.offset?.toString(),
        },
      }),
  });

/** Query options for fetching a single deployment */
export const deploymentOptions = (deploymentId: string) =>
  queryOptions({
    queryKey: deploymentsKeys.detail(deploymentId),
    queryFn: () =>
      getDeployment({
        path: { deploymentId },
      }),
  });

/** Query options for fetching deployment logs */
export const deploymentLogsOptions = (deploymentId: string, params?: { level?: LogLevel; after?: string }) =>
  queryOptions({
    queryKey: deploymentsKeys.logs(deploymentId, params),
    queryFn: () =>
      getDeploymentLogs({
        path: { deploymentId },
        query: params,
      }),
    refetchInterval: 5000, // Poll every 5 seconds for live logs
  });

/** Trigger a new deployment */
export const triggerDeploymentMutation = (
  repositoryId: string,
  body: { artifactSource?: 'release' | 'workflow' | 'manual'; artifactId?: string; branch?: string } = {},
) =>
  triggerDeployment2({
    path: { repositoryId },
    body,
  });

/** Rollback to a previous deployment */
export const rollbackDeploymentMutation = (repositoryId: string, deploymentId: string) =>
  rollbackDeployment({
    path: { repositoryId },
    body: { deploymentId },
  });

/** Cancel a pending deployment */
export const cancelDeploymentMutation = (deploymentId: string) =>
  cancelDeployment({
    path: { deploymentId },
  });
