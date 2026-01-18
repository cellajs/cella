import crypto from 'node:crypto';
import { Octokit } from 'octokit';

/**
 * GitHub repository information returned from the API.
 */
export type GitHubRepo = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
  private: boolean;
  description: string | null;
  htmlUrl: string;
};

/**
 * GitHub release information.
 */
export type GitHubRelease = {
  id: number;
  tagName: string;
  name: string | null;
  body: string | null;
  createdAt: string;
  assets: GitHubReleaseAsset[];
};

/**
 * GitHub release asset information.
 */
export type GitHubReleaseAsset = {
  id: number;
  name: string;
  contentType: string;
  size: number;
  downloadUrl: string;
};

/**
 * Create an Octokit instance with the user's access token.
 * @param accessToken - The user's GitHub OAuth access token.
 */
export const createGitHubClient = (accessToken: string): InstanceType<typeof Octokit> => {
  return new Octokit({ auth: accessToken });
};

/**
 * List repositories accessible to the authenticated user.
 * @param accessToken - The user's GitHub OAuth access token.
 * @param options - Optional parameters for filtering.
 */
export const listUserRepos = async (
  accessToken: string,
  options: { perPage?: number; page?: number; sort?: 'updated' | 'created' | 'pushed' | 'full_name' } = {},
): Promise<GitHubRepo[]> => {
  const octokit = createGitHubClient(accessToken);
  const { perPage = 30, page = 1, sort = 'updated' } = options;

  const response = await octokit.rest.repos.listForAuthenticatedUser({
    per_page: perPage,
    page,
    sort,
    affiliation: 'owner,collaborator,organization_member',
  });

  return response.data.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    defaultBranch: repo.default_branch,
    private: repo.private,
    description: repo.description,
    htmlUrl: repo.html_url,
  }));
};

/**
 * Get details for a specific repository.
 * @param accessToken - The user's GitHub OAuth access token.
 * @param owner - Repository owner.
 * @param repo - Repository name.
 */
export const getRepoDetails = async (accessToken: string, owner: string, repo: string): Promise<GitHubRepo> => {
  const octokit = createGitHubClient(accessToken);

  const response = await octokit.rest.repos.get({ owner, repo });

  return {
    id: response.data.id,
    name: response.data.name,
    fullName: response.data.full_name,
    owner: response.data.owner.login,
    defaultBranch: response.data.default_branch,
    private: response.data.private,
    description: response.data.description,
    htmlUrl: response.data.html_url,
  };
};

/**
 * Create a webhook on a GitHub repository.
 * @param accessToken - The user's GitHub OAuth access token.
 * @param owner - Repository owner.
 * @param repo - Repository name.
 * @param webhookUrl - The URL to receive webhook events.
 * @param secret - The webhook secret for signature verification.
 * @param events - The events to subscribe to.
 */
export const createWebhook = async (
  accessToken: string,
  owner: string,
  repo: string,
  webhookUrl: string,
  secret: string,
  events: string[] = ['release', 'workflow_run'],
): Promise<{ id: number; url: string }> => {
  const octokit = createGitHubClient(accessToken);

  const response = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    config: {
      url: webhookUrl,
      content_type: 'json',
      secret,
      insecure_ssl: '0',
    },
    events,
    active: true,
  });

  return {
    id: response.data.id,
    url: response.data.url,
  };
};

/**
 * Delete a webhook from a GitHub repository.
 * @param accessToken - The user's GitHub OAuth access token.
 * @param owner - Repository owner.
 * @param repo - Repository name.
 * @param hookId - The webhook ID to delete.
 */
export const deleteWebhook = async (
  accessToken: string,
  owner: string,
  repo: string,
  hookId: number,
): Promise<void> => {
  const octokit = createGitHubClient(accessToken);

  await octokit.rest.repos.deleteWebhook({
    owner,
    repo,
    hook_id: hookId,
  });
};

/**
 * Get the latest release for a repository.
 * @param accessToken - The user's GitHub OAuth access token.
 * @param owner - Repository owner.
 * @param repo - Repository name.
 */
export const getLatestRelease = async (
  accessToken: string,
  owner: string,
  repo: string,
): Promise<GitHubRelease | null> => {
  const octokit = createGitHubClient(accessToken);

  try {
    const response = await octokit.rest.repos.getLatestRelease({ owner, repo });

    return {
      id: response.data.id,
      tagName: response.data.tag_name,
      name: response.data.name ?? null,
      body: response.data.body ?? null,
      createdAt: response.data.created_at,
      assets: response.data.assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        contentType: asset.content_type,
        size: asset.size,
        downloadUrl: asset.browser_download_url,
      })),
    };
  } catch (error) {
    // No releases found
    return null;
  }
};

/**
 * Download a release asset.
 * @param accessToken - The user's GitHub OAuth access token.
 * @param owner - Repository owner.
 * @param repo - Repository name.
 * @param assetId - The asset ID to download.
 */
export const downloadReleaseAsset = async (
  accessToken: string,
  owner: string,
  repo: string,
  assetId: number,
): Promise<ArrayBuffer> => {
  const octokit = createGitHubClient(accessToken);

  const response = await octokit.rest.repos.getReleaseAsset({
    owner,
    repo,
    asset_id: assetId,
    headers: {
      Accept: 'application/octet-stream',
    },
  });

  return response.data as unknown as ArrayBuffer;
};

/**
 * List workflow runs for a repository.
 * @param accessToken - The user's GitHub OAuth access token.
 * @param owner - Repository owner.
 * @param repo - Repository name.
 * @param options - Optional parameters for filtering.
 */
export const listWorkflowRuns = async (
  accessToken: string,
  owner: string,
  repo: string,
  options: { branch?: string; status?: 'completed' | 'in_progress' | 'queued'; perPage?: number } = {},
): Promise<
  Array<{
    id: number;
    name: string | null;
    status: string | null;
    conclusion: string | null;
    createdAt: string;
    headSha: string;
  }>
> => {
  const octokit = createGitHubClient(accessToken);

  const response = await octokit.rest.actions.listWorkflowRunsForRepo({
    owner,
    repo,
    branch: options.branch,
    status: options.status,
    per_page: options.perPage || 10,
  });

  return response.data.workflow_runs.map((run) => ({
    id: run.id,
    name: run.name ?? null,
    status: run.status,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    headSha: run.head_sha,
  }));
};

/**
 * Download artifacts from a workflow run.
 * @param accessToken - The user's GitHub OAuth access token.
 * @param owner - Repository owner.
 * @param repo - Repository name.
 * @param runId - The workflow run ID.
 * @param artifactName - Optional specific artifact name to download.
 */
export const downloadWorkflowArtifact = async (
  accessToken: string,
  owner: string,
  repo: string,
  runId: number,
  artifactName?: string,
): Promise<ArrayBuffer | null> => {
  const octokit = createGitHubClient(accessToken);

  // List artifacts for the run
  const artifactsResponse = await octokit.rest.actions.listWorkflowRunArtifacts({
    owner,
    repo,
    run_id: runId,
  });

  // Find the artifact to download
  const artifact = artifactName
    ? artifactsResponse.data.artifacts.find((a) => a.name === artifactName)
    : artifactsResponse.data.artifacts[0]; // Default to first artifact

  if (!artifact) {
    return null;
  }

  // Download the artifact
  const downloadResponse = await octokit.rest.actions.downloadArtifact({
    owner,
    repo,
    artifact_id: artifact.id,
    archive_format: 'zip',
  });

  return downloadResponse.data as unknown as ArrayBuffer;
};

/**
 * Generate a secure webhook secret.
 */
export const generateWebhookSecret = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Verify a GitHub webhook signature.
 * @param payload - The raw webhook payload body.
 * @param signature - The X-Hub-Signature-256 header value.
 * @param secret - The webhook secret.
 */
export const verifyWebhookSignature = (payload: string | Buffer, signature: string | null, secret: string): boolean => {
  if (!signature) {
    return false;
  }

  const payloadBuffer = typeof payload === 'string' ? Buffer.from(payload) : payload;
  const expectedSignature = `sha256=${crypto.createHmac('sha256', secret).update(payloadBuffer).digest('hex')}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
};
