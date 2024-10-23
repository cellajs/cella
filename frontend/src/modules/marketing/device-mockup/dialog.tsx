import { DialogTitle } from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader } from '~/modules/ui/dialog';
import DeviceCarousel from './carousel';

interface DeviceDialogProps {
  isOpen: boolean;
  carouselSlide: number;
  slides?: { src: string }[];
  onOpenChange: (open: boolean) => void;
}

const DeviceDialog = ({ isOpen, onOpenChange, slides, carouselSlide }: DeviceDialogProps) => {
  const { t } = useTranslation();

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0">
        <DialogHeader className="absolute p-3 w-full backdrop-blur-sm bg-background/50">
          <DialogTitle className="text-center font-semibold text-lg">{t('common:view_screenshot')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap relative -z-[1] h-screen justify-center p-2 grow">
          <DeviceCarousel slides={slides} onOpenChange={onOpenChange} isDialog slide={carouselSlide} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeviceDialog;
