import { createFileRoute, redirect } from '@tanstack/react-router';
import { defaultLegalSubject } from '~/modules/marketing/legal/legal-config';

/**
 * Index route that redirects to the first legal subject.
 */
export const Route = createFileRoute('/_public/legal/')({
  staticData: { isAuth: false },
  beforeLoad: () => {
    throw redirect({ to: '/legal/$subject', params: { subject: defaultLegalSubject } });
  },
});
