import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import StickyBox from '~/modules/common/sticky-box';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/modules/ui/sheet';

export interface SheetProp {
  id: string;
  content?: React.ReactNode;
  title?: string | React.ReactNode;
  description?: React.ReactNode;
  modal?: boolean;
  side?: 'bottom' | 'top' | 'right' | 'left';
  className?: string;
  removeSheet: () => void;
}

export default function DesktopSheet({ id, title, description, modal = true, side = 'right', content, className, removeSheet }: SheetProp) {
  const { t } = useTranslation();

  return (
    <Sheet open={true} modal={modal}>
      <SheetContent
        id={id}
        onEscapeKeyDown={removeSheet}
        // TODO: I think this can go away because there are other ways to close the sheet. for nav sheet we use route listener.
        // onPointerDownOutside={(e) => {
        //   if (!modal) {
        //     // to prevent reopen on menu nav click
        //     const target = e.target as HTMLElement | null;
        //     if (!target) return;
        //     // Find the button element based on its id or any child element
        //     const button = document.getElementById(id);
        //     // Check if the click event target is the button itself or any of its children
        //     if (button && (button === target || button.contains(target))) return;
        //   }
        //   removeSheet();
        // }}
        side={side}
        aria-describedby={undefined}
        className={`${className} items-start`}
      >
        <StickyBox className={`z-10 flex items-center justify-between bg-background py-4 ${title ? '' : 'hidden'}`}>
          <SheetTitle>{title}</SheetTitle>

          <SheetClose onClick={removeSheet} className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none">
            <X size={24} strokeWidth={1.25} />
            <span className="sr-only">{t('common:close')}</span>
          </SheetClose>
        </StickyBox>
        <SheetHeader className={`${description || title ? '' : 'hidden'}`}>
          <SheetDescription className={`${description ? '' : 'hidden'}`}>{description}</SheetDescription>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
}
