import { useSuspenseQuery } from '@tanstack/react-query';
import { GitBranchIcon, GlobeIcon, RocketIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { repositoriesListOptions } from './query';
import type { RepositoryWithDeployment } from './types';

interface RepositoriesListProps {
  orgIdOrSlug: string;
}

/**
 * Displays a list of connected repositories with their deployment status.
 */
export function RepositoriesList({ orgIdOrSlug }: RepositoriesListProps) {
  const { t } = useTranslation();
  const { data: repositories } = useSuspenseQuery(repositoriesListOptions(orgIdOrSlug));

  if (!repositories || repositories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('common:no_results')}</CardTitle>
          <CardDescription>{t('common:no_repositories_connected')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href={`/${orgIdOrSlug}/hosting/connect`}>{t('common:connect_repository')}</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {repositories.map((repo) => (
        <RepositoryCard key={repo.id} repository={repo} orgIdOrSlug={orgIdOrSlug} />
      ))}
    </div>
  );
}

interface RepositoryCardProps {
  repository: RepositoryWithDeployment;
  orgIdOrSlug: string;
}

/** Individual repository card with status and actions */
function RepositoryCard({ repository, orgIdOrSlug }: RepositoryCardProps) {
  const { t } = useTranslation();

  const statusColor = getStatusColor(repository.lastDeployment?.status);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <GitBranchIcon className="h-4 w-4" />
            {repository.name}
          </CardTitle>
          <CardDescription>{repository.githubFullName}</CardDescription>
        </div>
        <Badge variant={statusColor}>{repository.lastDeployment?.status || t('common:no_deployments')}</Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {repository.defaultDomain && (
              <span className="flex items-center gap-1">
                <GlobeIcon className="h-3 w-3" />
                {repository.defaultDomain}
              </span>
            )}
            <span className="flex items-center gap-1">
              <GitBranchIcon className="h-3 w-3" />
              {repository.branch}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`/${orgIdOrSlug}/hosting/repositories/${repository.id}`}>{t('common:view')}</a>
            </Button>
            <Button size="sm" variant="default">
              <RocketIcon className="h-3 w-3 mr-1" />
              {t('common:deploy')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Get badge variant based on deployment status */
function getStatusColor(status?: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'deployed':
      return 'default';
    case 'pending':
    case 'downloading':
    case 'uploading':
    case 'deploying':
      return 'secondary';
    case 'failed':
      return 'destructive';
    default:
      return 'outline';
  }
}
