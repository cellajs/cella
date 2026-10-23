import { useTranslation } from 'react-i18next';
import { useUrlSheet } from '~/modules/common/sheeter/use-url-sheet';
import { UserSheet } from '~/modules/user/user-sheet';
import { tw } from '~/utils/tw';

export function UserSheetHandler() {
  const { t } = useTranslation();

  useUrlSheet({
    searchParamKey: 'userSheetId',
    renderContent: (id, organizationId) => <UserSheet id={id} organizationId={organizationId} />,
    // The title names the sheet for assistive technology; the profile shows the user's own name as its heading.
    options: { side: 'right', title: t('c:profile'), headerClassName: 'hidden', className: tw('max-w-full p-0 lg:max-w-4xl') },
  });

  return null;
}
