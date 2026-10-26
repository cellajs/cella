import { ChevronLeftIcon, TrashIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import type { TKey } from '~/lib/i18n-locales';
import { DropdownActionItem } from '~/modules/common/dropdowner/dropdown-action-item';
import { useDropdownerSurface } from '~/modules/common/dropdowner/surface';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import type { IconComponent } from '~/modules/common/icons/types';
import { useOverlayClose } from '~/modules/common/overlay-close';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';
import { DrawerRowSeparator } from '~/modules/ui/drawer';

interface DeleteFormProps {
  onDelete: () => void;
  /** By default Cancel steps back out of the confirmation: to the menu it replaced, or closing its dropdown or dialog. */
  onCancel?: () => void;
  pending: boolean;
  allowOfflineDelete?: boolean;
  /** The destructive option's label, `c:confirm_delete` by default. */
  label?: TKey;
  /** `c:cancel` by default. */
  cancelLabel?: TKey;
  /** A trash can by default. */
  icon?: IconComponent;
}

/** A destructive choice and its way out: two menu items or drawer rows in a dropdown, two buttons elsewhere. */
export function DeleteForm({
  onDelete,
  onCancel,
  pending,
  allowOfflineDelete = false,
  label = 'c:confirm_delete',
  cancelLabel = 'c:cancel',
  icon: Icon = TrashIcon,
}: DeleteFormProps) {
  const { t } = useTranslation();
  const surface = useDropdownerSurface();
  const overlay = useOverlayClose();
  const handleCancel = onCancel ?? overlay?.back;

  if (surface === 'menu' || surface === 'drawer') {
    return (
      <DeleteRows
        onDelete={onDelete}
        onCancel={handleCancel}
        pending={pending}
        allowOfflineDelete={allowOfflineDelete}
        label={label}
        cancelLabel={cancelLabel}
        icon={Icon}
      />
    );
  }

  return (
    <div className="flex flex-col in-data-dock:justify-center gap-2 sm:flex-row">
      <SubmitButton variant="destructive" icon={<Icon />} allowOfflineDelete={allowOfflineDelete} onClick={onDelete} loading={pending}>
        {t(label)}
      </SubmitButton>
      <Button type="reset" variant="secondary" data-autofocus onClick={handleCancel}>
        {t(cancelLabel)}
      </Button>
    </div>
  );
}

// A press this soon after the confirmation appeared was aimed at the menu item it replaced
const armDelay = 300;

type DeleteRowsProps = Required<Omit<DeleteFormProps, 'onCancel'>> & Pick<DeleteFormProps, 'onCancel'>;

function DeleteRows({ onDelete, onCancel, pending, allowOfflineDelete, label, cancelLabel, icon }: DeleteRowsProps) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();
  const inDrawer = useDropdownerSurface() === 'drawer';
  const canGoBack = useDropdowner((state) => !!state.dropdown?.history.length);
  const [shownAt] = useState(() => performance.now());

  const offline = !allowOfflineDelete && !isOnline;

  const confirm = () => {
    if (performance.now() - shownAt < armDelay) return;
    if (offline) return toastOffline();
    onDelete();
  };

  return (
    <>
      <DropdownActionItem icon={offline ? TriangleAlertIcon : icon} variant="destructive" loading={pending} closeOnSelect={false} onSelect={confirm}>
        {t(label)}
      </DropdownActionItem>
      {inDrawer && <DrawerRowSeparator />}
      <DropdownActionItem icon={canGoBack ? ChevronLeftIcon : XIcon} closeOnSelect={false} initialFocus onSelect={onCancel}>
        {t(cancelLabel)}
      </DropdownActionItem>
    </>
  );
}
