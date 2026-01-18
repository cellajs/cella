import { and, eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { type DeploymentLogEntry, type DeploymentStatus, deploymentsTable } from '#/db/schema/deployments';
import { repositoriesTable } from '#/db/schema/repositories';
import { extractArchive } from '#/lib/archive';
import { createGitHubClient, downloadReleaseAsset, downloadWorkflowArtifact, getLatestRelease } from '#/lib/github';
import { getGitHubAccessTokenForOrganization } from '#/lib/oauth-token';
import { isEdgeConfigured, purgeCache, updateBackendStage } from '#/lib/scaleway-edge';
import { isS3Configured, uploadDirectory } from '#/lib/scaleway-s3';
import { logEvent } from '#/utils/logger';

/**
 * Core deployment service that handles the deployment pipeline:
 * 1. Download artifacts from GitHub (release or workflow)
 * 2. Upload to Scaleway S3
 * 3. Update Edge Services configuration
 * 4. Update deployment status and logs
 */

/**
 * Process a deployment by downloading artifacts and uploading to S3
 */
export async function processDeployment(deploymentId: string): Promise<void> {
  const [deployment] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));

  if (!deployment) {
    throw new Error(`Deployment ${deploymentId} not found`);
  }

  const [repository] = await db
    .select()
    .from(repositoriesTable)
    .where(eq(repositoriesTable.id, deployment.repositoryId));

  if (!repository) {
    throw new Error(`Repository ${deployment.repositoryId} not found`);
  }

  try {
    // Update status to downloading
    await updateDeploymentStatus(deploymentId, 'downloading', 'Starting artifact download...');

    // Get GitHub access token from a member of the organization
    const accessToken = await getGitHubAccessTokenForOrganization(repository.organizationId);

    const octokit = createGitHubClient(accessToken);

    // Download artifact based on source
    let artifactBuffer: Buffer;
    let commitSha: string;

    if (deployment.artifactSource === 'release') {
      const downloadResult = await downloadFromRelease(octokit, repository, deployment.artifactUrl);
      artifactBuffer = downloadResult.buffer;
      commitSha = downloadResult.commitSha;
    } else if (deployment.artifactSource === 'workflow') {
      const downloadResult = await downloadFromWorkflow(octokit, repository, deployment.artifactUrl);
      artifactBuffer = downloadResult.buffer;
      commitSha = downloadResult.commitSha;
    } else {
      throw new Error(`Unsupported artifact source: ${deployment.artifactSource}`);
    }

    // Extract archive
    await addDeploymentLog(
      deploymentId,
      'info',
      `Downloaded artifact (${formatBytes(artifactBuffer.length)}), extracting...`,
    );

    const files = await extractArchive(artifactBuffer);
    await addDeploymentLog(deploymentId, 'info', `Extracted ${files.length} files`);

    // Update status to uploading
    await updateDeploymentStatus(deploymentId, 'uploading', 'Uploading to Scaleway S3...');

    // Upload to S3
    const s3Path = await uploadToS3(repository.s3BucketName!, files, commitSha);
    await addDeploymentLog(deploymentId, 'info', `Uploaded to S3: ${s3Path}`);

    // Update status to deploying
    await updateDeploymentStatus(deploymentId, 'deploying', 'Configuring Edge Services...');

    // Configure Edge Services
    const deployedUrl = await configureEdgeServices(repository, s3Path);
    await addDeploymentLog(deploymentId, 'info', `Edge Services configured: ${deployedUrl}`);

    // Mark as deployed and active
    await db
      .update(deploymentsTable)
      .set({
        status: 'deployed',
        isActive: true,
        commitSha,
        s3Path,
        deployedUrl,
      })
      .where(eq(deploymentsTable.id, deploymentId));

    // Deactivate previous deployments
    await db
      .update(deploymentsTable)
      .set({ isActive: false })
      .where(and(eq(deploymentsTable.repositoryId, repository.id), eq(deploymentsTable.isActive, true)));

    await addDeploymentLog(deploymentId, 'info', 'Deployment completed successfully');

    logEvent('info', 'Deployment completed', {
      deploymentId,
      repositoryId: repository.id,
      commitSha,
      deployedUrl,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await db
      .update(deploymentsTable)
      .set({
        status: 'failed',
        errorMessage,
      })
      .where(eq(deploymentsTable.id, deploymentId));

    await addDeploymentLog(deploymentId, 'error', `Deployment failed: ${errorMessage}`);

    logEvent('error', 'Deployment failed', { deploymentId, error: errorMessage });
  }
}

/**
 * Download artifact from a GitHub release
 */
async function downloadFromRelease(
  // biome-ignore lint/suspicious/noExplicitAny: Octokit types are complex
  octokit: any,
  repository: typeof repositoriesTable.$inferSelect,
  releaseIdOrTag?: string | null,
): Promise<{ buffer: Buffer; commitSha: string }> {
  const [owner, repo] = repository.githubFullName.split('/');

  // Get release (latest if not specified)
  const release = releaseIdOrTag
    ? await octokit.rest.repos.getReleaseByTag({ owner, repo, tag: releaseIdOrTag })
    : await getLatestRelease(octokit, owner, repo);

  if (!release) {
    throw new Error('No release found');
  }

  const releaseData = 'data' in release ? release.data : release;

  // Find the artifact matching the build path or get the first zip/tar
  const buildPath = repository.buildArtifactPath ?? 'dist';
  const asset = releaseData.assets.find(
    (a: { name: string }) => a.name.includes(buildPath) || a.name.endsWith('.zip') || a.name.endsWith('.tar.gz'),
  );

  if (!asset) {
    throw new Error('No suitable asset found in release');
  }

  const arrayBuffer = await downloadReleaseAsset(octokit, owner, repo, asset.id);
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    commitSha: releaseData.target_commitish,
  };
}

/**
 * Download artifact from a GitHub workflow run
 */
async function downloadFromWorkflow(
  // biome-ignore lint/suspicious/noExplicitAny: Octokit types are complex
  octokit: any,
  repository: typeof repositoriesTable.$inferSelect,
  workflowRunId?: string | null,
): Promise<{ buffer: Buffer; commitSha: string }> {
  const [owner, repo] = repository.githubFullName.split('/');

  if (!workflowRunId) {
    throw new Error('Workflow run ID required for workflow artifact source');
  }

  // Get workflow run details
  const { data: run } = await octokit.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: Number.parseInt(workflowRunId, 10),
  });

  // List artifacts for the run
  const { data: artifacts } = await octokit.rest.actions.listWorkflowRunArtifacts({
    owner,
    repo,
    run_id: run.id,
  });

  const buildPath = repository.buildArtifactPath ?? 'dist';
  const artifact = artifacts.artifacts.find((a: { name: string }) => a.name.includes(buildPath) || a.name === 'build');

  if (!artifact) {
    throw new Error('No suitable artifact found in workflow run');
  }

  const arrayBuffer = await downloadWorkflowArtifact(octokit, owner, repo, artifact.id);
  if (!arrayBuffer) {
    throw new Error('Failed to download workflow artifact');
  }
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    commitSha: run.head_sha,
  };
}

/**
 * Upload artifact to Scaleway S3
 */
async function uploadToS3(
  bucketName: string,
  files: Array<{ path: string; content: Buffer }>,
  commitSha: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const s3Path = `deployments/${commitSha.substring(0, 8)}/${timestamp}`;

  if (!isS3Configured()) {
    logEvent('warn', 'S3 not configured, skipping upload', { bucketName, s3Path });
    return s3Path;
  }

  await uploadDirectory(bucketName, s3Path, files);

  logEvent('info', 'Uploaded deployment to S3', { bucketName, s3Path, fileCount: files.length });

  return s3Path;
}

/**
 * Configure Scaleway Edge Services to serve from the new S3 path
 */
async function configureEdgeServices(
  repository: typeof repositoriesTable.$inferSelect,
  s3Path: string,
): Promise<string> {
  if (!isEdgeConfigured()) {
    logEvent('warn', 'Edge Services not configured, skipping', {
      pipelineId: repository.scalewayPipelineId,
      s3Path,
    });
    return repository.defaultDomain ?? `https://${repository.s3BucketName}.s3-website.scw.cloud`;
  }

  // Update backend stage to point to new S3 path
  if (repository.scalewayPipelineId && repository.scalewayBackendStageId) {
    await updateBackendStage(repository.scalewayBackendStageId, repository.s3BucketName!, s3Path);

    // Purge cache to serve fresh content
    await purgeCache(repository.scalewayPipelineId);
  }

  logEvent('info', 'Edge Services configured', {
    pipelineId: repository.scalewayPipelineId,
    s3Path,
  });

  return repository.defaultDomain ?? `https://${repository.s3BucketName}.edge.scw.cloud`;
}

/**
 * Update deployment status and add a log entry
 */
async function updateDeploymentStatus(deploymentId: string, status: DeploymentStatus, message: string): Promise<void> {
  const [deployment] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));

  if (deployment) {
    await db
      .update(deploymentsTable)
      .set({
        status,
        logs: [...(deployment.logs ?? []), createLogEntry('info', message)],
      })
      .where(eq(deploymentsTable.id, deploymentId));
  }
}

/**
 * Add a log entry to a deployment
 */
async function addDeploymentLog(
  deploymentId: string,
  level: DeploymentLogEntry['level'],
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const [deployment] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));

  if (deployment) {
    await db
      .update(deploymentsTable)
      .set({
        logs: [...(deployment.logs ?? []), createLogEntry(level, message, metadata)],
      })
      .where(eq(deploymentsTable.id, deploymentId));
  }
}

/**
 * Create a log entry
 */
function createLogEntry(
  level: DeploymentLogEntry['level'],
  message: string,
  metadata?: Record<string, unknown>,
): DeploymentLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    metadata,
  };
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}
