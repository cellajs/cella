import { config } from 'config';
import { Undo } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Confetti } from '~/modules/home/onboarding/confetti';
import { onboardingFinishCallback } from '~/modules/home/onboarding/onboarding-config';
import { useNavigationStore } from '~/store/navigation';

export const OnboardingCompleted = () => {
  const { t } = useTranslation();
  const { menu, setSectionsDefault, finishedOnboarding } = useNavigationStore();

  const [isExploding, _] = useState(true);
  const effectRan = useRef(false);

  useEffect(() => {
    if (effectRan.current) return;
    effectRan.current = true;

    const sortedOrganizations = [...menu.organization].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const lastCreatedOrganization = sortedOrganizations[0];

    onboardingFinishCallback();

    if (!lastCreatedOrganization) return;

    setSectionsDefault();
  }, []);

  return (
    <div className="min-w-full h-screen flex flex-col items-center justify-center text-center mx-auto space-y-6 p-4 relative z-1 max-w-3xl">
      {isExploding && <Confetti fire />}

      {finishedOnboarding && (
        <Undo size={400} strokeWidth={0.1} className="max-md:hidden scale-y-75 md:-translate-x-24 -mt-52 -mb-12  text-primary rotate-[30deg]" />
      )}
      <h1 className="text-3xl font-bold">{t('common:onboarding_completed')}</h1>
      <p className="text-xl text-foreground/90 md:text-2xl max-w-md font-light md:leading-9 pb-8">
        {t('common:onboarding_completed.text', { appName: config.name })}
      </p>
    </div>
  );
};
