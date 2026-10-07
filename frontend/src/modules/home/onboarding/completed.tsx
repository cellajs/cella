import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { HomeIcon, PlusIcon, UndoIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { appConfig } from 'shared';
import { getMenuSection } from '~/lib/entity-modules';
import { Confetti } from '~/modules/home/onboarding/confetti';
import { useUpdateSelfFlagsMutation } from '~/modules/me/query';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { Button } from '~/modules/ui/button';
import { useCurrentUser } from '~/modules/user/user-store';
import { flattenInfiniteData } from '~/query/basic/flatten';

export function OnboardingCompleted() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const setSectionsDefault = useNavigationStore((state) => state.setSectionsDefault);

  const { mutate } = useUpdateSelfFlagsMutation();

  const [isExploding] = useState(true);
  const didRun = useRef(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);

  const orgQuery = useInfiniteQuery(organizationsListQueryOptions({ relatableUserId: user.id }));
  const organizations = flattenInfiniteData<Organization>(orgQuery.data);
  const hasOrganization = organizations.length > 0;

  // Without an organization, offer the same create action the menu offers; otherwise the text points to the navigation.
  const createOrganization = getMenuSection('organization')?.createAction;

  useEffect(() => {
    // Run once, after the org list has either resolved or finished fetching.
    if (didRun.current) return;
    if (orgQuery.isFetching) return;

    didRun.current = true;
    mutate({ userFlags: { finishedOnboarding: true } });
    if (hasOrganization) setSectionsDefault();
  }, [mutate, setSectionsDefault, hasOrganization, orgQuery.isFetching]);

  return (
    <div className="relative z-1 mx-auto flex h-svh min-w-full max-w-3xl flex-col items-center justify-center gap-6 p-4 text-center">
      {isExploding && <Confetti fire />}

      {user.userFlags.finishedOnboarding && (
        <UndoIcon strokeWidth={0.1} className="-mt-52 -mb-12 size-100 rotate-30 scale-y-75 text-primary max-md:hidden md:-translate-x-24" />
      )}
      <h1 className="font-bold text-3xl">{t('c:onboarding_completed')}</h1>
      <p className="max-w-md pb-8 text-foreground/90 text-xl md:text-2xl md:leading-9">
        {t('c:onboarding_completed.text', { appName: appConfig.name })}
      </p>

      {/* Both actions appear together, once the organization list has settled and the flag is set: neither moves under the pointer. */}
      {user.userFlags.finishedOnboarding && (
        <div className="flex gap-2 max-sm:w-full max-sm:flex-col">
          {!hasOrganization && createOrganization && (
            <Button ref={createButtonRef} variant="secondary" onClick={() => createOrganization(createButtonRef)}>
              <PlusIcon />
              {t('c:create_resource', { resource: t('c:organization').toLowerCase() })}
            </Button>
          )}
          {/* Replaces the history entry: going back to welcome would only redirect forward again. */}
          <Button variant="plain" render={<Link to="/home" replace />}>
            <HomeIcon />
            {t('c:home')}
          </Button>
        </div>
      )}
    </div>
  );
}
