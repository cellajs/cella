import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { useDropdownerSurface } from '~/modules/common/dropdowner/surface';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { NamedText } from '~/modules/common/named-text';
import { DrawerLead, DrawerRowGroup } from '~/modules/ui/drawer';
import { DropdownMenuGroup, DropdownMenuLabel } from '~/modules/ui/dropdown-menu';

interface PopConfirmProps {
  children: ReactNode;
  /** The question asked: a `NamedText` when it names what the action hits, so that name shows in bold. */
  title: ReactNode;
}

/** A confirmation inside a dropdown: in a menu its question labels the two items below it, in the drawer it heads two rows. */
export function PopConfirm({ children, title }: PopConfirmProps) {
  const surface = useDropdownerSurface();

  if (surface === 'menu') {
    return (
      // contain-inline-size keeps a long question from widening the popup: it grows only to the popup's min-width.
      // text-balance carries a name that fits but leaves no room for its "?" down to the line of that mark
      <DropdownMenuGroup className="min-w-80 contain-inline-size">
        <DropdownMenuLabel className="text-balance py-2 font-normal text-foreground">{title}</DropdownMenuLabel>
        {children}
      </DropdownMenuGroup>
    );
  }

  if (surface === 'drawer') {
    return (
      // The menu's lead sits in the same place, so the swap changes only its sentence
      <div className="flex flex-col gap-2">
        <DrawerLead>{title}</DrawerLead>
        <DrawerRowGroup>{children}</DrawerRowGroup>
      </div>
    );
  }

  return (
    <div className="flex w-max max-w-80 flex-col gap-3 p-3">
      <p className="text-balance text-sm">{title}</p>
      {children}
    </div>
  );
}

interface DeleteQuestionProps {
  /** What is deleted, e.g. `c:project`. */
  resource: TKey;
  name: string;
}

/** The question a delete confirmation asks: "Delete project **Roadmap**?". */
export function DeleteQuestion({ resource, name }: DeleteQuestionProps) {
  const { t } = useTranslation();
  return <NamedText i18nKey="c:confirm.delete_resource" name={name} values={{ resource: t(resource) }} />;
}

/** Turns the open menu (e.g. a table row's "…") into a confirmation; its Cancel steps back to the menu. */
export function openPopConfirm(title: ReactNode, children: ReactNode) {
  dropdowner.getState().push(<PopConfirm title={title}>{children}</PopConfirm>);
}
