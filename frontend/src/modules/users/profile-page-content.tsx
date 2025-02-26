import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { toaster } from '~/modules/common/toaster';
import type { LimitedEntity } from '~/modules/general/types';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';
import { declineByDomain, domainSuggestedOrganizations, joinByDomain } from '~/modules/users/api';
import { queryClient } from '~/query/query-client';

const ProfilePageContent = ({ sheet, userId }: { userId: string; orgIdOrSlug?: string; sheet?: boolean }) => {
  const { t } = useTranslation();

  const { data: suggestions } = useQuery({
    queryKey: ['sameDomainSuggestions'],
    queryFn: domainSuggestedOrganizations,
    // Enable the query only when `orgIdOrSlug` is defined
    // enabled: !!orgIdOrSlug,
  });

  const queryUpdate = (idOrSlug: string) => {
    queryClient.setQueryData(['sameDomainSuggestions'], (oldData: LimitedEntity[]) => {
      return oldData.filter((org) => org.id !== idOrSlug);
    });
  };

  const { mutate: join, isPending: joinPending } = useMutation({
    mutationFn: joinByDomain,
    onSuccess: (_, { idOrSlug }) => {
      queryUpdate(idOrSlug);
      toaster(t('common:success.you_joined_organization'), 'success');
    },
  });

  const { mutate: decline, isPending: declinePending } = useMutation({
    mutationFn: declineByDomain,
    onSuccess: (_, { idOrSlug }) => {
      queryUpdate(idOrSlug);
      toaster(t('common:decline_request'), 'success');
    },
  });

  // Don't render anything until `orgId` is available
  // if (!orgIdOrSlug) return <div>Do a get organizations request here</div>;
  console.info('ProfilePageContent', { userId, sheet });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Domain suggested organizations</CardTitle>
      </CardHeader>
      <CardContent>
        {suggestions?.map((org) => (
          <div key={org.id} className="flex justify-between items-center">
            <div className="flex space-x-2 items-center">
              <AvatarWrap className="h-8 w-8" type={org.entity} id={org.id} name={org.name} url={org.thumbnailUrl} />
              <span className="truncate font-medium">{org.name}</span>
            </div>
            <div className="flex space-x-2 items-center">
              <Button size="xs" variant="darkSuccess" loading={joinPending} onClick={() => join({ idOrSlug: org.id })}>
                {t('common:join')}
              </Button>
              <Button size="xs" variant="destructive" loading={declinePending} onClick={() => decline({ idOrSlug: org.id })}>
                {t('common:decline')}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default ProfilePageContent;
