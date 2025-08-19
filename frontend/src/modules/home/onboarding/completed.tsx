import { appConfig } from 'config';
import { Undo } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Confetti } from '~/modules/home/onboarding/confetti';
import { onboardingFinishCallback } from '~/modules/home/onboarding/onboarding-config';
import { useUpdateSelfFlagsMutation } from '~/modules/me/query';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

export const OnboardingCompleted = () => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const { menu, setSectionsDefault } = useNavigationStore();

  const { mutate } = useUpdateSelfFlagsMutation();

  const [isExploding, _] = useState(true);
  const effectRan = useRef(false);

  useEffect(() => {
    if (effectRan.current) return;
    effectRan.current = true;

    const sortedOrganizations = [...menu.organization].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const lastCreatedOrganization = sortedOrganizations[0];

    const body = {
      userFlags: {
        finishedOnboarding: true,
      },
    };

    mutate(body, { onSuccess: () => onboardingFinishCallback() });

    if (!lastCreatedOrganization) return;

    setSectionsDefault();
  }, []);

  return (
    <div className="min-w-full h-screen flex flex-col items-center justify-center text-center mx-auto space-y-6 p-4 relative z-1 max-w-3xl">
      {isExploding && <Confetti fire />}

      {user.userFlags.finishedOnboarding && (
        <Undo size={400} strokeWidth={0.1} className="max-md:hidden scale-y-75 md:-translate-x-24 -mt-52 -mb-12  text-primary rotate-[30deg]" />
      )}
      <h1 className="text-3xl font-bold">{t('app:onboarding_completed')}</h1>
      <p className="text-xl text-foreground/90 md:text-2xl max-w-md font-light md:leading-9 pb-8">
        {t('app:onboarding_completed.text', { appName: appConfig.name })}
      </p>
    </div>
  );
};
