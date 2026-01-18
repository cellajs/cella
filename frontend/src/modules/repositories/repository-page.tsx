import { useMutation } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  GlobeIcon,
  RefreshCwIcon,
  RocketIcon,
  SettingsIcon,
  Trash2Icon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Repository } from '~/api.gen';
import { DeploymentsList } from '~/modules/deployments/deployments-list';
import { DomainsList } from '~/modules/domains/domains-list';
import { Badge } from '~/modules/ui/badge';
import { Button, buttonVariants } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/modules/ui/tabs';
import { queryClient } from '~/query/query-client';
import { HostingRoute } from '~/routes/hosting-routes';
import { OrganizationRoute } from '~/routes/organization-routes';
import { useToastStore } from '~/store/toast';
import { repositoriesKeys, triggerRepositoryDeployment } from './query';

interface RepositoryPageProps {
  repository: Repository;
}

/**
 * Repository details page with deployments and domains.
 */
export default function RepositoryPage({ repository }: RepositoryPageProps) {
  const { t } = useTranslation();
  const { idOrSlug } = useParams({ from: OrganizationRoute.id });
  const { showToast } = useToastStore();

  const deployMutation = useMutation({
    mutationFn: () => triggerRepositoryDeployment(idOrSlug, repository.id),
    onSuccess: () => {
      showToast(t('common:deployment_triggered'), 'success');
      queryClient.invalidateQueries({ queryKey: repositoriesKeys.detail(idOrSlug, repository.id) });
    },
    onError: (err) => {
      showToast(err.message || t('common:deployment_failed'), 'error');
    },
  });

  const statusLabel = repository.isActive ? 'active' : 'inactive';
  const statusVariant = repository.isActive ? 'default' : 'outline';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            to={HostingRoute.to}
            params={{ idOrSlug }}
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{repository.name}</h1>
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            </div>
            <p className="text-muted-foreground font-mono text-sm">{repository.githubFullName}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`https://github.com/${repository.githubFullName}`} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon className="h-4 w-4 mr-2" />
              GitHub
            </a>
          </Button>
          <Button onClick={() => deployMutation.mutate()} disabled={deployMutation.isPending}>
            <RocketIcon className="h-4 w-4 mr-2" />
            {deployMutation.isPending ? t('common:deploying') : t('common:deploy_now')}
          </Button>
        </div>
      </div>

      {/* Quick Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('common:branch')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <GitBranchIcon className="h-4 w-4" />
              <span className="font-mono">{repository.branch}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('common:domain')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <GlobeIcon className="h-4 w-4" />
              {repository.defaultDomain ? (
                <a
                  href={`https://${repository.defaultDomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-primary hover:underline"
                >
                  {repository.defaultDomain}
                </a>
              ) : (
                <span className="text-muted-foreground">{t('common:not_configured')}</span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('common:storage')}</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-sm">{repository.s3BucketName || t('common:pending')}</span>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Deployments, Domains, Settings */}
      <Tabs defaultValue="deployments">
        <TabsList>
          <TabsTrigger value="deployments">
            <RocketIcon className="h-4 w-4 mr-2" />
            {t('common:deployments')}
          </TabsTrigger>
          <TabsTrigger value="domains">
            <GlobeIcon className="h-4 w-4 mr-2" />
            {t('common:domains')}
          </TabsTrigger>
          <TabsTrigger value="settings">
            <SettingsIcon className="h-4 w-4 mr-2" />
            {t('common:settings')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deployments" className="mt-4">
          <DeploymentsList repositoryId={repository.id} />
        </TabsContent>

        <TabsContent value="domains" className="mt-4">
          <DomainsList repositoryId={repository.id} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('common:repository_settings')}</CardTitle>
              <CardDescription>{t('common:manage_repo_config')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">{t('common:refresh_webhook')}</p>
                  <p className="text-sm text-muted-foreground">{t('common:recreate_github_webhook')}</p>
                </div>
                <Button variant="outline">
                  <RefreshCwIcon className="h-4 w-4 mr-2" />
                  {t('common:refresh')}
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg border-destructive/50">
                <div>
                  <p className="font-medium text-destructive">{t('common:disconnect_repository')}</p>
                  <p className="text-sm text-muted-foreground">{t('common:disconnect_warning')}</p>
                </div>
                <Button variant="destructive">
                  <Trash2Icon className="h-4 w-4 mr-2" />
                  {t('common:disconnect')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
