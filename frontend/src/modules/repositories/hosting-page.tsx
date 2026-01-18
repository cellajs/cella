import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { GitBranchIcon, PlusIcon, RocketIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Repository } from '~/api.gen';
import { Badge } from '~/modules/ui/badge';
import { Button, buttonVariants } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { ConnectRepositoryRoute, HostingRoute, RepositoryRoute } from '~/routes/hosting-routes';
import { repositoriesListOptions } from './query';

interface HostingPageProps {
  organizationId: string;
}

/**
 * Main hosting dashboard showing connected repositories.
 */
export default function HostingPage({ organizationId }: HostingPageProps) {
  const { t } = useTranslation();
  const { idOrSlug } = useParams({ from: HostingRoute.id });
  const { data: repositories } = useSuspenseQuery(repositoriesListOptions(organizationId));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('common:hosting')}</h1>
          <p className="text-muted-foreground">{t('common:manage_deployments')}</p>
        </div>
        <Link to={ConnectRepositoryRoute.to} params={{ idOrSlug }} className={buttonVariants()}>
          <PlusIcon className="h-4 w-4 mr-2" />
          {t('common:connect_repository')}
        </Link>
      </div>

      {!repositories || repositories.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('common:no_repositories')}</CardTitle>
            <CardDescription>{t('common:connect_first_repo')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to={ConnectRepositoryRoute.to} params={{ idOrSlug }} className={buttonVariants()}>
              <GitBranchIcon className="h-4 w-4 mr-2" />
              {t('common:connect_repository')}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {repositories?.map((repo) => (
            <RepositoryCard key={repo.id} repository={repo} idOrSlug={idOrSlug} />
          ))}
        </div>
      )}
    </div>
  );
}

interface RepositoryCardProps {
  repository: Repository;
  idOrSlug: string;
}

/** Repository card with status and quick actions */
function RepositoryCard({ repository, idOrSlug }: RepositoryCardProps) {
  const { t } = useTranslation();

  const getStatusVariant = (isActive: boolean) => {
    return isActive ? 'default' : 'outline';
  };

  const statusLabel = repository.isActive ? 'active' : 'inactive';

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{repository.name}</CardTitle>
            <CardDescription className="font-mono text-xs">{repository.githubFullName}</CardDescription>
          </div>
          <Badge variant={getStatusVariant(repository.isActive)}>{statusLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
          <span className="flex items-center gap-1">
            <GitBranchIcon className="h-3 w-3" />
            {repository.branch}
          </span>
          {repository.defaultDomain && (
            <a
              href={`https://${repository.defaultDomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {repository.defaultDomain}
            </a>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            to={RepositoryRoute.to}
            params={{ idOrSlug, repoId: repository.id }}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {t('common:view_details')}
          </Link>
          <Button size="sm">
            <RocketIcon className="h-3 w-3 mr-1" />
            {t('common:deploy')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
