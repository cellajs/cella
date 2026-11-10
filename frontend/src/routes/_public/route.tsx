import { createFileRoute } from '@tanstack/react-router';
import { publicLayoutBeforeLoad } from '~/modules/auth/route-logic';
import { PublicLayout } from '~/modules/common/public-layout';

export const Route = createFileRoute('/_public')({
  staticData: { boundary: 'public' },
  beforeLoad: publicLayoutBeforeLoad,
  component: PublicLayout,
});
