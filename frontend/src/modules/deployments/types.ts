/** Deployment from API response */
export type Deployment = {
  id: string;
  commitSha: string | null;
  branch: string;
  status: DeploymentStatus;
  isActive: boolean;
  artifactSource: 'release' | 'workflow' | 'manual';
  artifactId: string | null;
  s3Path: string | null;
  deployedUrl: string | null;
  logs: DeploymentLog[];
  triggeredBy: string | null;
  repositoryId: string;
  createdAt: string;
  modifiedAt: string | null;
};

/** Deployment in list response */
export type DeploymentListItem = Deployment;

/** Deployment log entry */
export type DeploymentLog = {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
};

/** Deployment status values */
export type DeploymentStatus =
  | 'pending'
  | 'downloading'
  | 'uploading'
  | 'deploying'
  | 'deployed'
  | 'failed'
  | 'rolled_back';

/** Log level values */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
