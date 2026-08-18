import { createFileRoute } from '@tanstack/react-router';
import { AccessibilityPage } from '~/modules/marketing/accessibility-page';
import { appTitle } from '~/utils/app-title';

export const Route = createFileRoute('/_public/_marketing/accessibility')({
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Accessibility') }] }),
  component: AccessibilityPage,
});
