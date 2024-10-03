import { config } from 'config';
import { t } from 'i18next';
import { createProject } from '~/api/projects';
import { createWorkspace } from '~/api/workspaces';
import { addMenuItem } from '~/modules/common/nav-sheet/helpers/add-menu-item';
import type { StepItem } from '~/modules/common/stepper/types';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import type { UserMenuItem } from '~/types/common';

export const onDefaultBoardingSteps: StepItem[] = [
  {
    id: 'profile',
    label: 'Tune your profile',
    optional: true,
    description: t('common:onboarding_step1', { name: useUserStore.getState().user.name }),
  },
  { id: 'organization', label: 'Create organization', optional: true, description: t('common:onboarding_step2') },
  {
    id: 'invitation',
    label: 'Invite others',
    optional: true,
    description: t('common:onboarding_step3', { appName: config.name }),
  },
];

// Add the options you want to execute when onboarding is finished
export const onBoardingFinishCallback = () => {
  const [lastCreatedOrganization] = [...useNavigationStore.getState().menu.organizations].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  createWorkspace({
    name: 'Demo workspace',
    slug: `${lastCreatedOrganization.slug}-workspace`,
    organizationId: lastCreatedOrganization.id,
  }).then((createdWorkspace) => {
    useNavigationStore.setState({ menu: addMenuItem(createdWorkspace as UserMenuItem, 'workspaces') });
    for (let i = 3; i !== 0; i--) {
      const namingArr = ['one', 'two', 'three'];
      createProject({
        name: `Demo project ${namingArr[i - 1]}`,
        slug: `${lastCreatedOrganization.slug}-project-${i}`,
        organizationId: lastCreatedOrganization.id,
        workspaceId: createdWorkspace.id,
      }).then((createdProject) => {
        useNavigationStore.setState({
          menu: addMenuItem({ ...createdProject, ...({ parentId: createdProject.workspaceId } as UserMenuItem) }, 'workspaces'),
        });
      });
    }
  });
  // For example, in this callback, the onboarding state is set to 'finished' for the current user
  useNavigationStore.setState({ finishedOnboarding: true });
};
