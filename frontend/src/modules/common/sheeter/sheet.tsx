import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import StickyBox from '~/modules/common/sticky-box';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetPortal, SheetTitle } from '~/modules/ui/sheet';

export interface SheetProp {
  content?: React.ReactNode;
  title?: string | React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

export default function DesktopSheet({ title, description, content, className, onOpenChange }: SheetProp) {
  const { t } = useTranslation();

  return (
    <Sheet open={true} onOpenChange={onOpenChange} modal>
      <SheetPortal>
        <SheetContent aria-describedby={undefined} className={`${className} items-start`}>
          <StickyBox className={`z-10 flex items-center justify-between bg-background py-4 ${title ? '' : 'hidden'}`}>
            <SheetTitle>{title}</SheetTitle>
            <SheetClose className="mr-1 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none">
              <X size={24} strokeWidth={1.25} />
              <span className="sr-only">{t('common:close')}</span>
            </SheetClose>
          </StickyBox>
          <SheetHeader className={`${description || title ? '' : 'hidden'}`}>
            <SheetDescription className={`${description ? '' : 'hidden'}`}>{description}</SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </SheetPortal>
    </Sheet>
  );
}
