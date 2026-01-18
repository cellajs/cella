import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { AlertCircleIcon, CheckIcon, GitBranchIcon, LockIcon, UnlockIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { connectRepository } from '~/api.gen';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { Input } from '~/modules/ui/input';
import { queryClient } from '~/query/query-client';
import { HostingRoute } from '~/routes/hosting-routes';
import { OrganizationRoute } from '~/routes/organization-routes';
import { useToastStore } from '~/store/toast';
import { githubReposOptions, repositoriesKeys } from './query';

interface ConnectRepositoryPageProps {
  organizationId: string;
}

/**
 * Page for connecting a new GitHub repository.
 */
export default function ConnectRepositoryPage({ organizationId }: ConnectRepositoryPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { idOrSlug } = useParams({ from: OrganizationRoute.id });
  const { showToast } = useToastStore();
  const [search, setSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  const { data: repos, isError, error } = useSuspenseQuery(githubReposOptions());

  const connectMutation = useMutation({
    mutationFn: (repo: { id: number; name: string; fullName: string; owner: string; defaultBranch: string }) =>
      connectRepository({
        path: { orgIdOrSlug: idOrSlug },
        body: {
          githubRepoId: repo.id,
          githubRepoName: repo.name,
          githubFullName: repo.fullName,
          githubOwner: repo.owner,
          branch: repo.defaultBranch,
        },
      }),
    onSuccess: () => {
      showToast(t('common:repository_connected'), 'success');
      queryClient.invalidateQueries({ queryKey: repositoriesKeys.list(organizationId) });
      navigate({ to: HostingRoute.to, params: { idOrSlug } });
    },
    onError: (err) => {
      showToast(err.message || t('common:error.connect_failed'), 'error');
    },
  });

  const filteredRepos = (repos ?? []).filter(
    (repo) =>
      repo.name.toLowerCase().includes(search.toLowerCase()) ||
      repo.fullName.toLowerCase().includes(search.toLowerCase()),
  );

  const handleConnect = () => {
    const repo = repos?.find((r) => r.fullName === selectedRepo);
    if (repo) {
      connectMutation.mutate(repo);
    }
  };

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircleIcon className="h-5 w-5 text-destructive" />
            {t('common:github_connection_required')}
          </CardTitle>
          <CardDescription>{error?.message || t('common:sign_in_with_github')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href="/api/oauth/github">{t('common:connect_github')}</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('common:connect_repository')}</h1>
        <p className="text-muted-foreground">{t('common:select_repo_to_deploy')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('common:your_repositories')}</CardTitle>
          <CardDescription>{t('common:select_repo_from_github')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder={t('common:search_repositories')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="max-h-96 overflow-y-auto space-y-2">
            {filteredRepos.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">{t('common:no_repositories_found')}</p>
            ) : (
              filteredRepos.map((repo) => (
                <div
                  key={repo.fullName}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${selectedRepo === repo.fullName ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                  onClick={() => setSelectedRepo(repo.fullName)}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedRepo(repo.fullName)}
                >
                  <div className="flex items-center gap-3">
                    {selectedRepo === repo.fullName ? (
                      <CheckIcon className="h-4 w-4 text-primary" />
                    ) : (
                      <GitBranchIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">{repo.name}</p>
                      <p className="text-sm text-muted-foreground">{repo.fullName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {repo.private ? (
                      <LockIcon className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <UnlockIcon className="h-3 w-3 text-muted-foreground" />
                    )}
                    <Badge variant="outline">{repo.defaultBranch}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => navigate({ to: HostingRoute.to, params: { idOrSlug } })}>
              {t('common:cancel')}
            </Button>
            <Button onClick={handleConnect} disabled={!selectedRepo || connectMutation.isPending}>
              {connectMutation.isPending ? t('common:connecting') : t('common:connect')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
