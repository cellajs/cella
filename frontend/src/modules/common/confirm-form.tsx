import { ChevronLeftIcon, LoaderCircleIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
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
import { DrawerRowGroup, DrawerRowSeparator } from '~/modules/ui/drawer';

export interface ConfirmFormProps {
  /** The act, translated: "Delete organization", "Publish". */
  label: string;
  onConfirm: () => void;
  /** By default Cancel steps back out of the confirmation: to the menu it replaced, or closing its dropdown or dialog. */
  onCancel?: () => void;
  pending: boolean;
  /** Lets the act through offline, for a write that queues. */
  allowOffline?: boolean;
  /** `destructive` for a loss, which also starts focus on Cancel. */
  variant?: 'default' | 'destructive';
  icon?: IconComponent;
  /** `c:cancel` by default. */
  cancelLabel?: TKey;
}

// A press this soon after the confirmation appeared was aimed at the menu item it replaced
const armDelay = 300;

/** A confirmed choice and its way out: two menu items in a dropdown, action-sheet rows in a phone's drawer, two buttons elsewhere. */
export function ConfirmForm({
  label,
  onConfirm,
  onCancel,
  pending,
  allowOffline = false,
  variant = 'default',
  icon: Icon,
  cancelLabel = 'c:cancel',
}: ConfirmFormProps) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();
  const surface = useDropdownerSurface();
  const overlay = useOverlayClose();
  const canGoBack = useDropdowner((state) => surface !== null && !!state.dropdown?.history.length);
  const [shownAt] = useState(() => performance.now());

  const handleCancel = onCancel ?? overlay?.back;
  const cancelFirst = variant === 'destructive';

  if (surface !== 'menu' && !overlay?.drawer) {
    return (
      <div className="flex flex-col in-data-dock:justify-center gap-2 sm:flex-row">
        <SubmitButton
          variant={variant}
          icon={Icon && <Icon />}
          allowOfflineDelete={allowOffline}
          data-autofocus={!cancelFirst || undefined}
          onClick={onConfirm}
          loading={pending}
        >
          {label}
        </SubmitButton>
        <Button type="reset" variant="secondary" data-autofocus={cancelFirst || undefined} onClick={handleCancel}>
          {t(cancelLabel)}
        </Button>
      </div>
    );
  }

  const offline = !allowOffline && !isOnline;
  const ActIcon = offline ? TriangleAlertIcon : Icon;
  const CancelIcon = canGoBack ? ChevronLeftIcon : XIcon;

  const confirm = () => {
    if (performance.now() - shownAt < armDelay) return;
    if (offline) return toastOffline();
    onConfirm();
  };

  if (overlay?.drawer) {
    return (
      <DrawerRowGroup>
        <Button
          variant="row"
          data-autofocus={!cancelFirst || undefined}
          aria-busy={pending || undefined}
          disabled={pending}
          onClick={confirm}
          className={cancelFirst ? 'text-destructive' : 'font-medium'}
        >
          {pending ? <LoaderCircleIcon className="animate-spin" /> : ActIcon && <ActIcon />}
          {label}
        </Button>
        <DrawerRowSeparator />
        <Button variant="row" data-autofocus={cancelFirst || undefined} onClick={handleCancel}>
          <CancelIcon />
          {t(cancelLabel)}
        </Button>
      </DrawerRowGroup>
    );
  }

  return (
    <>
      <DropdownActionItem icon={ActIcon} variant={variant} loading={pending} closeOnSelect={false} initialFocus={!cancelFirst} onSelect={confirm}>
        {label}
      </DropdownActionItem>
      <DropdownActionItem icon={CancelIcon} closeOnSelect={false} initialFocus={cancelFirst} onSelect={handleCancel}>
        {t(cancelLabel)}
      </DropdownActionItem>
    </>
  );
}
