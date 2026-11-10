import { useTranslation } from 'react-i18next';
import { useUIStore } from '~/modules/ui/ui-store';

/**
 * The link preview image `index.html` names, at its 1200x630 size: the tagline over the app's `readme` screenshot, which
 * bleeds off the bottom edge. `pnpm cella shoot thumbnail` writes it to `thumbnail.jpg`.
 */
export function ThumbnailPage() {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);

  return (
    <main className="rich-gradient bg-background relative isolate h-[630px] w-[1200px] overflow-hidden">
      {/* Inside the 60px margin every link preview keeps, at a size Slack's 360px-wide preview still reads */}
      <h1 className="font-heading text-foreground absolute inset-x-15 top-15.5 text-center text-[66px] leading-19 font-extrabold tracking-[-0.025em] text-balance">
        {t('c:tagline.text')}
      </h1>
      <div className="bg-background absolute top-63 left-30 h-135 w-240 overflow-hidden rounded-t-2xl border-4 border-b-0 border-zinc-400 shadow-[0_30px_80px_rgb(0_0_0/0.45)] dark:border-zinc-700">
        <img src={`/static/marketing/screenshots/readme-screenshot${mode === 'dark' ? '-dark' : ''}.webp`} alt="" className="block w-full" />
      </div>
    </main>
  );
}
