import { Menu, Undo } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ConfettiExplosion from 'react-confetti-explosion';
import { useTranslation } from 'react-i18next';
import { createProject } from '~/api/projects';
import { createWorkspace } from '~/api/workspaces';
import { addMenuItem } from '~/lib/utils';
import { SheetMenu } from '~/modules/common/nav-sheet/sheet-menu';
import { useNavigationStore } from '~/store/navigation';
import type { UserMenuItem } from '~/types';

export const OnboardingCompleted = () => {
  const { t } = useTranslation();
  const { menu, setSheet, setSectionsDefault, finishedOnboarding, setFinishedOnboarding } = useNavigationStore();
  const [isExploding, _] = useState(true);
  const effectRan = useRef(false);

  useEffect(() => {
    // If already run, exit
    if (effectRan.current || finishedOnboarding) return;
    effectRan.current = true;
    const sortedOrganizations = [...menu.organizations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const lastCreatedOrganization = sortedOrganizations[0];

    if (!lastCreatedOrganization) return;
    createWorkspace({
      name: 'Demo workspace',
      slug: `${lastCreatedOrganization.slug}-workspace`,
      organizationId: lastCreatedOrganization.id,
    }).then((createdWorkspace) => {
      useNavigationStore.setState({ menu: addMenuItem(createdWorkspace as UserMenuItem, 'workspaces') });
      for (let i = 3; i !== 0; i--) {
        const namingArr = ['one', 'two', 'three'];
        createProject(createdWorkspace.id, {
          name: `Demo project ${namingArr[i - 1]}`,
          slug: `${lastCreatedOrganization.slug}-project-${i}`,
          organizationId: lastCreatedOrganization.id,
        }).then((createdProject) => {
          useNavigationStore.setState({
            menu: addMenuItem({ ...createdProject, ...({ parentId: createdProject.workspaceId } as UserMenuItem) }, 'workspaces'),
          });
        });
      }
    });
    setSectionsDefault();
    setTimeout(
      () => {
        setSheet({ id: 'menu', sheet: <SheetMenu />, icon: Menu });
        setFinishedOnboarding();
      },
      finishedOnboarding ? 500 : 4000,
    );
  }, []);

  return (
    <div className="min-w-full h-screen flex flex-col items-center justify-center text-center mx-auto space-y-6 p-4 relative z-[1] max-w-3xl">
      {isExploding && !finishedOnboarding && (
        <ConfettiExplosion zIndex={0} duration={5000} force={0.8} particleCount={250} height={'100vh'} width={1500} />
      )}

      {finishedOnboarding && (
        <Undo size={400} strokeWidth={0.1} className="max-xl:hidden scale-y-75 -mt-40 -mb-12 -translate-x-32 text-primary rotate-[30deg]" />
      )}
      <h1 className="text-3xl font-bold">{t('common:onboarding_completed')}</h1>
      <p className="text-xl text-foreground/90 md:text-2xl font-light leading-7 pb-8">{t('common:onboarding_completed.text')}</p>
    </div>
  );
};
