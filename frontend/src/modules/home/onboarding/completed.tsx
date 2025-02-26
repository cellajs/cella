import { config } from 'config';
import { Undo } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sheet } from '~/modules/common/sheeter/state';
import { Confetti } from '~/modules/home/onboarding/confetti';
import { onBoardingFinishCallback } from '~/modules/home/onboarding/onboarding-config';
import { MenuSheet } from '~/modules/navigation/menu-sheet';
import { useNavigationStore } from '~/store/navigation';

export const OnboardingCompleted = () => {
  const { t } = useTranslation();
  const { menu, setSectionsDefault, finishedOnboarding } = useNavigationStore();

  const [isExploding, _] = useState(true);
  const effectRan = useRef(false);

  useEffect(() => {
    // If already run, exit
    if (effectRan.current) return;
    effectRan.current = true;
    const sortedOrganizations = [...menu.organizations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const lastCreatedOrganization = sortedOrganizations[0];

    onBoardingFinishCallback();

    if (!lastCreatedOrganization) return;

    setSectionsDefault();
    setTimeout(
      () => {
        sheet.create(<MenuSheet />, {
          id: 'menu-nav',
          side: 'left',
          modal: false,
          className:
            'fixed sm:z-80 inset-0 left-16 p-0 backdrop-blur-xs max-w-80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        });
      },
      finishedOnboarding ? 500 : 4000,
    );
  }, []);

  return (
    <div className="min-w-full h-screen flex flex-col items-center justify-center text-center mx-auto space-y-6 p-4 relative z-1 max-w-3xl">
      {isExploding && <Confetti fire />}

      {finishedOnboarding && (
        <Undo size={400} strokeWidth={0.1} className="max-lg:hidden scale-y-75 xl:-translate-x-24 -mt-40 -mb-12  text-primary rotate-[30deg]" />
      )}
      <h1 className="text-3xl font-bold">{t('common:onboarding_completed')}</h1>
      <p className="text-xl text-foreground/90 md:text-2xl font-light leading-7 pb-8">
        {t('common:onboarding_completed.text', { appName: config.name })}
      </p>
    </div>
  );
};
