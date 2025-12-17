import { useInfiniteQuery } from '@tanstack/react-query';
import { appConfig } from 'config';
import { UndoIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Organization } from '~/api.gen';
import { Confetti } from '~/modules/home/onboarding/confetti';
import { onboardingFinishCallback } from '~/modules/home/onboarding/onboarding-config';
import { useUpdateSelfFlagsMutation } from '~/modules/me/query';
import { getContextEntityTypeToListQueries } from '~/offline-config';
import { flattenInfiniteData } from '~/query/utils/flatten';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

export const OnboardingCompleted = () => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const { setSectionsDefault } = useNavigationStore();

  const { mutate } = useUpdateSelfFlagsMutation();

  const [isExploding] = useState(true);
  const didRun = useRef(false);

  // REVIEW Fetch organizations to determine the last created organization
  const orgQuery = useInfiniteQuery(getContextEntityTypeToListQueries().organization({ userId: user.id }));
  const organizations = flattenInfiniteData(orgQuery.data) satisfies Organization[];

  const lastCreatedOrganization = useMemo(() => {
    if (organizations.length === 0) return undefined;
    return [...organizations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [organizations]);

  useEffect(() => {
    // run once (but wait until org query has either data or is done fetching)
    if (didRun.current) return;
    if (orgQuery.isFetching) return;

    didRun.current = true;

    mutate({ userFlags: { finishedOnboarding: true } }, { onSuccess: () => onboardingFinishCallback() });

    if (lastCreatedOrganization) {
      setSectionsDefault();
    }
  }, [mutate, setSectionsDefault, lastCreatedOrganization, orgQuery.isFetching]);

  return (
    <div className="min-w-full h-screen flex flex-col items-center justify-center text-center mx-auto space-y-6 p-4 relative z-1 max-w-3xl">
      {isExploding && <Confetti fire />}

      {user.userFlags.finishedOnboarding && (
        <UndoIcon size={400} strokeWidth={0.1} className="max-md:hidden scale-y-75 md:-translate-x-24 -mt-52 -mb-12  text-primary rotate-[30deg]" />
      )}
      <h1 className="text-3xl font-bold">{t('common:onboarding_completed')}</h1>
      <p className="text-xl text-foreground/90 md:text-2xl max-w-md font-light md:leading-9 pb-8">
        {t('common:onboarding_completed.text', { appName: appConfig.name })}
      </p>
    </div>
  );
};
