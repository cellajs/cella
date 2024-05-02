import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ConfettiExplosion from 'react-confetti-explosion';
import { useNavigationStore } from '~/store/navigation';
import { SheetMenu } from '~/modules/common/nav-sheet/sheet-menu';
import { Menu } from 'lucide-react';
import { createWorkspace } from '~/api/workspaces';
import { useNavigate } from '@tanstack/react-router';

export const OnboardingCompleted = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { menu, setSheet } = useNavigationStore();
  const [isExploding, _] = useState(true);

  useEffect(() => {
    const organizations = menu.organizations.items;
    const organization = organizations[organizations.length - 1];
    createWorkspace({
      name: `${organization.name}-DEMOworkspace`,
      slug: `${organization.slug}-workspace`,
      organization: organization.id,
    });
    setTimeout(() => {
      navigate({
        to: '/home',
      });
      setSheet({ id: 'menu', sheet: <SheetMenu />, icon: Menu });
    }, 4000);
  }, []);

  return (
    <div className="min-w-full h-screen flex flex-col items-center justify-center text-center mx-auto space-y-6 p-4 relative z-[1] max-w-[700px]">
      {isExploding && <ConfettiExplosion zIndex={0} duration={5000} force={0.8} particleCount={250} height={'100vh'} width={1500} />}
      <h1 className="text-3xl font-bold">{t('common:onboarding_completed')}</h1>
      <p className="text-xl text-foreground/90 md:text-2xl font-light leading-7 pb-8">{t('common:onboarding_completed.text')}</p>
    </div>
  );
};
