import { Pencil } from 'lucide-react';
import { i18n } from '~/lib/i18n';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import type { User } from '~/modules/users/types';
import UpdateUserForm from '~/modules/users/update-user-form';

interface Props {
  user: User;
  tabIndex: number;
}

const openUpdateSheet = (user: User) => {
  const title = i18n.t('common:edit_resource', { resource: i18n.t('common:user').toLowerCase() });
  const createSheet = useSheeter.getState().create;

  createSheet(
    <Card>
      <CardContent>
        <UpdateUserForm user={user} sheet />
      </CardContent>
    </Card>,
    {
      id: 'update-user',
      side: 'right',
      className: 'max-w-full lg:max-w-4xl',
      title,
      titleContent: <UnsavedBadge title={title} />,
      scrollableOverlay: true,
      removeCallback: () => {
        // Return focus to the original cell after closing
        setTimeout(() => {
          const cell = document.getElementById(`update-${user.id}`);
          if (cell) cell.focus();
        }, 0);
      },
    },
  );
};

const UpdateRow = ({ user, tabIndex }: Props) => {
  return (
    <Button
      id={`update-${user.id}`}
      variant="cell"
      size="icon"
      tabIndex={tabIndex}
      className="h-full w-full"
      data-tooltip="true"
      data-tooltip-content={i18n.t('common:edit')}
      onClick={() => openUpdateSheet(user)}
    >
      <Pencil size={16} />
    </Button>
  );
};

export default UpdateRow;
