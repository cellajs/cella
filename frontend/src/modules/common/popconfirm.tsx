import type { ReactNode } from 'react';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';

interface Props {
  children: ReactNode;
  title: string;
}

export function PopConfirm({ children, title }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:w-max sm:max-w-72 sm:p-3">
      <p className="text-sm max-sm:py-3 max-sm:text-center">{title}</p>
      {children}
    </div>
  );
}

/**
 * Turns the open dropdown (e.g. a table row's "…" menu) into a confirmation panel on the same trigger. A menu cannot
 * hold a form: its items close it and its focus handling drops the buttons, so the confirmation opens as a panel.
 */
export function openPopConfirm(title: string, children: ReactNode) {
  useDropdowner.getState().update({ kind: 'panel', key: Date.now(), content: <PopConfirm title={title}>{children}</PopConfirm> });
}
