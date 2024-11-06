import { DialogTitle } from '@radix-ui/react-dialog';

import { Dialog, DialogContent, DialogDescription, DialogHeader } from '~/modules/ui/dialog';
import Carousel from './carousel';

interface CarouselDialogProps {
  isOpen: boolean;
  title: string;
  carouselSlide: number;
  slides?: { src: string; fileType?: string }[];
  onOpenChange: (open: boolean) => void;
}

const CarouselDialog = ({ isOpen, title, onOpenChange, slides, carouselSlide }: CarouselDialogProps) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent
      onOpenAutoFocus={(event: Event) => event.preventDefault()}
      className="min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0"
    >
      <DialogHeader className="absolute p-3 w-full backdrop-blur-sm bg-background/50">
        <DialogTitle className="text-center font-semibold text-lg">{title}</DialogTitle>
        <DialogDescription className="hidden" />
      </DialogHeader>
      <div className="flex flex-wrap relative -z-[1] h-screen justify-center p-2 grow">
        <Carousel slides={slides} onOpenChange={onOpenChange} isDialog slide={carouselSlide} />
      </div>
    </DialogContent>
  </Dialog>
);

export default CarouselDialog;
