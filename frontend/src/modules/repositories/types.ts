import type { Repository } from '~/api.gen';

/** Repository from API response */
export type { Repository };

/** Repository with last deployment info from list */
export type RepositoryWithDeployment = Repository & {
  deploymentCount?: number;
  lastDeployment?: {
    id: string;
    status: string;
    commitSha: string;
    createdAt: string;
  } | null;
};

/** GitHub repository available for connecting */
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
