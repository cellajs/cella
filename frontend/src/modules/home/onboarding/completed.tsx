import { useInfiniteQuery } from '@tanstack/react-query';
import { UndoIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { appConfig } from 'shared';
import { Confetti } from '~/modules/home/onboarding/confetti';
import { useUpdateSelfFlagsMutation } from '~/modules/me/query';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { useUserStore } from '~/modules/user/user-store';
import { flattenInfiniteData } from '~/query/basic/flatten';

interface OnboardingCompletedProps {
  createdOrganization: Organization | null;
  /** Result of the demo-data seed run during the organization step. `null` means seeding never ran (skipped org step or already had one). */
  seeded: boolean | null;
}

export const OnboardingCompleted = ({ createdOrganization, seeded }: OnboardingCompletedProps) => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const { setSectionsDefault } = useNavigationStore();

  const { mutate } = useUpdateSelfFlagsMutation();

  const [isExploding] = useState(true);
  const didRun = useRef(false);

  // Fetch organizations to determine whether the user has any orgs to land in.
  const orgQuery = useInfiniteQuery(organizationsListQueryOptions({ relatableUserId: user.id }));
  const organizations = flattenInfiniteData<Organization>(orgQuery.data);
  const hasOrganization = organizations.length > 0;

  // If an organization was just created, wait for the seed result before
  // marking onboarding finished so the menu cache is primed with the demo
  // workspace + projects on first paint.
  const seedingInFlight = !!createdOrganization && seeded === null;

  useEffect(() => {
    // Run once, after the org list has either resolved or finished fetching
    // and (when relevant) the seed has completed.
    if (didRun.current) return;
    if (orgQuery.isFetching) return;
    if (seedingInFlight) return;

    didRun.current = true;
    mutate({ userFlags: { finishedOnboarding: true } });
    if (hasOrganization) setSectionsDefault();
  }, [mutate, setSectionsDefault, hasOrganization, orgQuery.isFetching, seedingInFlight]);

  return (
    <div className="relative z-1 mx-auto flex h-screen min-w-full max-w-3xl flex-col items-center justify-center space-y-6 p-4 text-center">
      {isExploding && <Confetti fire />}

      {user.userFlags.finishedOnboarding && (
        <UndoIcon
          strokeWidth={0.1}
          className="-mt-52 -mb-12 size-100 rotate-30 scale-y-75 text-primary max-md:hidden md:-translate-x-24"
        />
      )}
      <h1 className="font-bold text-3xl">{t('c:onboarding_completed')}</h1>
      <p className="max-w-md pb-8 text-foreground/90 text-xl md:text-2xl md:leading-9">
        {seeded === true
          ? t('c:onboarding_demo_ready.text')
          : t('c:onboarding_completed.text', { appName: appConfig.name })}
      </p>
    </div>
  );
};
