import i18n from 'i18next';
import { PencilIcon } from 'lucide-react';
import { type RefObject, useRef } from 'react';
import type { User } from '~/api.gen';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import UpdateUserForm from '~/modules/users/update-user-form';

interface Props {
  user: User;
  tabIndex: number;
}

export function openUpdateUserSheet(user: User, buttonRef: RefObject<HTMLButtonElement | null>) {
  const title = i18n.t('common:edit_resource', { resource: i18n.t('common:user').toLowerCase() });
  const createSheet = useSheeter.getState().create;

  createSheet(
    <div className="container">
      <Card className="mb-20">
        <CardContent>
          <UpdateUserForm user={user} sheet />
        </CardContent>
      </Card>
    </div>,
    {
      id: 'update-user',
      triggerRef: buttonRef,
      side: 'right',
      className: 'max-w-full lg:max-w-4xl',
      title,
      titleContent: <UnsavedBadge title={title} />,
    },
  );
}

function UpdateRow({ user, tabIndex }: Props) {
  const buttonRef = useRef(null);

  return (
    <Button
      ref={buttonRef}
      variant="cell"
      size="icon"
      tabIndex={tabIndex}
      className="h-full w-full"
      data-tooltip="true"
      data-tooltip-content={i18n.t('common:edit')}
      onClick={() => openUpdateUserSheet(user, buttonRef)}
    >
      <PencilIcon size={16} />
    </Button>
  );
}

export default UpdateRow;
