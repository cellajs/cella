import { t } from 'i18next';
import Carousel from '~/modules/common/carousel';
import { dialog } from '~/modules/common/dialoger/state';

export type Slides = { src: string; fileType?: string };

export const openCarouselDialog = (slide: number, slides: Slides[], title?: string | React.ReactNode) => {
  dialog(
    <div className="flex flex-wrap relative -z-[1] h-screen justify-center p-2 grow">
      <Carousel slides={slides} isDialog slide={slide} />
    </div>,
    {
      id: 'file-preview',
      className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0',
      headerClassName: 'absolute p-3 w-full backdrop-blur-sm bg-background/50',
      title: title ?? t('common:view_attachment'),
      autoFocus: true,
    },
  );
};
