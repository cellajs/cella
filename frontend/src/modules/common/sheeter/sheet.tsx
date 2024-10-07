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

  const handleClose = (state: boolean) => {
    if (!state) removeSheet();
  };

  return (
    <Sheet open={true} onOpenChange={handleClose} modal={modal}>
      <SheetContent id={id} onEscapeKeyDown={removeSheet} side={side} aria-describedby={undefined} className={`${className} items-start`}>
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
