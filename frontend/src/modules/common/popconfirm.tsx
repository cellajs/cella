import type { ReactNode } from 'react';
import { useInDropdownerDrawer } from '~/modules/common/dropdowner/drawer';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { DrawerRowGroup } from '~/modules/ui/drawer';

interface PopConfirmProps {
  children: ReactNode;
  /** The question asked: a `NamedText` when it names what the action hits, so that name shows in bold. */
  title: ReactNode;
}

export function PopConfirm({ children, title }: PopConfirmProps) {
  const inDrawer = useInDropdownerDrawer();

  return (
    <div className="flex flex-col gap-3 sm:w-max sm:max-w-72 sm:p-3">
      <p className="text-sm max-sm:py-3 max-sm:text-center">{title}</p>
      {inDrawer ? <DrawerRowGroup>{children}</DrawerRowGroup> : children}
    </div>
  );
}

/**
 * Turns the open dropdown (e.g. a table row's "…" menu) into a confirmation panel on the same trigger. A menu cannot
 * hold a form: its items close it and its focus handling drops the buttons, so the confirmation opens as a panel.
 */
export function openPopConfirm(title: ReactNode, children: ReactNode) {
  dropdowner.getState().update({ kind: 'panel', key: Date.now(), content: <PopConfirm title={title}>{children}</PopConfirm> });
}
