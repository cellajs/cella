import { useUserStore } from '~/modules/user/user-store';

// Dynamic import to avoid circular dependency: router -> routeTree.gen -> route files
const navigate = (to: '/home' | '/welcome', replace = true) => {
  void import('~/routes/router').then(({ default: router }) => {
    router.navigate({ to, replace, ignoreBlocker: true });
  });
};

/**
 * Route onEnter helpers for onboarding redirects between home and welcome.
 * onEnter is used instead of beforeLoad: user store may not be populated yet during beforeLoad.
 */
export const redirectToWelcomeIfOnboarding = () => {
  const { user } = useUserStore.getState();
  if (!user) return;
  if (!user.userFlags.finishedOnboarding) navigate('/welcome');
};

export const redirectToHomeIfOnboarded = () => {
  const { user } = useUserStore.getState();
  if (!user) return;
  if (user.userFlags.finishedOnboarding) navigate('/home');
};
