import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, PlusIcon, UndoIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { appConfig } from 'shared';
import { menuSectionsSchema } from '~/menu-config';
import { Confetti } from '~/modules/home/onboarding/confetti';
import { useUpdateSelfFlagsMutation } from '~/modules/me/query';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { Button, buttonVariants } from '~/modules/ui/button';
import { useCurrentUser } from '~/modules/user/user-store';
import { flattenInfiniteData } from '~/query/basic/flatten';
import { getChannelRoute } from '~/utils/channel-route';

export function OnboardingCompleted() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { setSectionsDefault } = useNavigationStore();

  const { mutate } = useUpdateSelfFlagsMutation();

  const [isExploding] = useState(true);
  const didRun = useRef(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);

  const orgQuery = useInfiniteQuery(organizationsListQueryOptions({ relatableUserId: user.id }));
  const organizations = flattenInfiniteData<Organization>(orgQuery.data);
  const hasOrganization = organizations.length > 0;

  // Where to next: into the organization just joined or created, or, without one, the same create action the menu offers.
  const [organization] = organizations;
  const organizationRoute = organization ? getChannelRoute(organization) : null;
  const createOrganization = menuSectionsSchema.organization?.createAction;

  useEffect(() => {
    // Run once, after the org list has either resolved or finished fetching.
    if (didRun.current) return;
    if (orgQuery.isFetching) return;

    didRun.current = true;
    mutate({ userFlags: { finishedOnboarding: true } });
    if (hasOrganization) setSectionsDefault();
  }, [mutate, setSectionsDefault, hasOrganization, orgQuery.isFetching]);

  return (
    <div className="relative z-1 mx-auto flex h-svh min-w-full max-w-3xl flex-col items-center justify-center space-y-6 p-4 text-center">
      {isExploding && <Confetti fire />}

      {user.userFlags.finishedOnboarding && (
        <UndoIcon
          strokeWidth={0.1}
          className="-mt-52 -mb-12 size-100 rotate-30 scale-y-75 text-primary max-md:hidden md:-translate-x-24"
        />
      )}
      <h1 className="font-bold text-3xl">{t('c:onboarding_completed')}</h1>
      <p className="max-w-md pb-8 text-foreground/90 text-xl md:text-2xl md:leading-9">
        {t('c:onboarding_completed.text', { appName: appConfig.name })}
      </p>

      {organizationRoute && (
        <Link {...organizationRoute} className={buttonVariants()}>
          {t('c:go_to_resource', { resource: organization.name })}
          <ArrowRightIcon className="ml-2" />
        </Link>
      )}
      {!hasOrganization && !orgQuery.isFetching && createOrganization && (
        <Button ref={createButtonRef} variant="secondary" onClick={() => createOrganization(createButtonRef)}>
          <PlusIcon className="mr-2" />
          {t('c:create_resource', { resource: t('c:organization').toLowerCase() })}
        </Button>
      )}
    </div>
  );
}
