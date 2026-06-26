import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * Index route that redirects bare `/docs` to the operations page.
 */
export const Route = createFileRoute('/_public/_content/docs/')({
  staticData: { isAuth: false },
  beforeLoad: () => {
    throw redirect({ to: '/docs/operations', search: true, replace: true });
  },
});
