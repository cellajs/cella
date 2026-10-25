import { Link } from '@tanstack/react-router';
import type { Ref } from 'react';
import type { IconComponent } from '~/modules/common/icons/types';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { Button, type ButtonProps } from '~/modules/ui/button';

/** `onClick` acts in place and `render` is the row's element; `to` links, and while offline it warns and stays put unless `offlineAccess`. */
type NavSheetRowProps = { icon: IconComponent; label: string; id?: string; destructive?: boolean; ref?: Ref<HTMLButtonElement> } & (
  | { onClick: () => void }
  | { render: ButtonProps['render'] }
  | ({ to: string } & ({ offlineAccess: false; isOnline: boolean } | { offlineAccess: true; isOnline?: never }))
);

/** A full-width row of a nav sheet list; a `to` row closes the sheets unless the nav is pinned. */
export function NavSheetRow(props: NavSheetRowProps) {
  const { icon: Icon, label, id, destructive, ref } = props;

  const isDisabled = 'to' in props && !props.offlineAccess && !props.isOnline;

  const linkElement =
    'to' in props ? (
      <Link
        disabled={isDisabled}
        onClick={() => {
          if (isDisabled) return toastOffline();
          if (!navigationStore.getState().keepNavOpen) sheeter.getState().remove();
        }}
        to={props.to}
      />
    ) : undefined;

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="lg"
      id={id}
      className="w-full select-none justify-start text-left standalone:[-webkit-touch-callout:none] hover:bg-accent/50 data-[destructive=true]:text-destructive"
      data-destructive={destructive}
      onClick={'onClick' in props ? props.onClick : undefined}
      render={'render' in props ? props.render : linkElement}
    >
      <Icon className="size-4" />
      {label}
    </Button>
  );
}
