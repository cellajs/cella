import { createFileRoute, redirect } from '@tanstack/react-router';

/** Short public URL for the accessibility statement, which lives on the legal page. */
export const Route = createFileRoute('/_public/_marketing/accessibility')({
  staticData: { isAuth: false },
  beforeLoad: () => {
    throw redirect({ to: '/legal/$subject', params: { subject: 'accessibility' } });
  },
});
