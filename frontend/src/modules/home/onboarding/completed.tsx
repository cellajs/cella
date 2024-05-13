import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ConfettiExplosion from 'react-confetti-explosion';
import { useNavigationStore } from '~/store/navigation';
import { SheetMenu } from '~/modules/common/nav-sheet/sheet-menu';
import { Menu } from 'lucide-react';
import { createWorkspace } from '~/api/workspaces';
import { useUserStore } from '~/store/user';
import { useElectric } from '~/modules/common/root/electric';

export const OnboardingCompleted = () => {
  const { t } = useTranslation();
  const { menu, setSheet } = useNavigationStore();
  const [isExploding, _] = useState(true);
  const state = useUserStore();

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const { db } = useElectric()!;

  useEffect(() => {
    const sortedOrganizations = [...menu.organizations.items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const lastCreatedOrganization = sortedOrganizations[0];
    if (!state.finishOnboarding) {
      createWorkspace({
        name: `${lastCreatedOrganization.name}-DEMOworkspace`,
        slug: `${lastCreatedOrganization.slug}-workspace`,
        organization: lastCreatedOrganization.id,
      }).then((workspace) => {
        for (let i = 3; i !== 0; i--) {
          db.projects.create({
            data: {
              id: window.crypto.randomUUID(),
              name: `DEMO-test-project-${i}`,
              slug: `${i}test-project-${workspace.id}`,
              workspace_id: workspace.id,
              color: '#000000',
              created_at: new Date(),
              created_by: state.user.id,
            },
          });
        }
      });
    }
    setTimeout(
      () => {
        setSheet({ id: 'menu', sheet: <SheetMenu />, icon: Menu });
        state.completeOnboarding();
      },
      state.finishOnboarding ? 500 : 4000,
    );
  }, []);

  return (
    <div className="min-w-full h-screen flex flex-col items-center justify-center text-center mx-auto space-y-6 p-4 relative z-[1] max-w-[700px]">
      {isExploding && !state.finishOnboarding && (
        <ConfettiExplosion zIndex={0} duration={5000} force={0.8} particleCount={250} height={'100vh'} width={1500} />
      )}
      <h1 className="text-3xl font-bold">{t('common:onboarding_completed')}</h1>
      <p className="text-xl text-foreground/90 md:text-2xl font-light leading-7 pb-8">{t('common:onboarding_completed.text')}</p>
    </div>
  );
};
