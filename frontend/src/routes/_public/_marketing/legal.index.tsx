import { createFileRoute, redirect } from '@tanstack/react-router';
import { defaultLegalSubject } from '~/modules/auth/legal/legal-config';

export const Route = createFileRoute('/_public/_marketing/legal/')({
  beforeLoad: () => {
    throw redirect({ to: '/legal/$subject', params: { subject: defaultLegalSubject } });
  },
});
