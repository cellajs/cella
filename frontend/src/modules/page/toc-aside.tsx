import { TextAlignStartIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useCurrentSection } from '~/hooks/use-scroll-spy';
import { SpyNavItem } from '~/modules/common/spy-nav-item';
import type { DocHeading } from '~/modules/page/content';

interface TocAsideProps {
  headings: DocHeading[];
}

/** "On this page" nav: page headings with a cursor bar driven by the scroll spy store; view-page.tsx registers the sections. */
export function TocAside({ headings }: TocAsideProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm', false);
  const layoutId = useId();
  const currentSection = useCurrentSection();

  return (
    <nav className="flex w-full flex-col" aria-label={t('c:docs.on_this_page')}>
      <TextAlignStartIcon className="mb-2 ml-5 text-muted-foreground" />
      {headings.map(({ id, text, depth }) => (
        <SpyNavItem
          key={id}
          id={id}
          isActive={currentSection === id}
          layoutId={layoutId}
          group="toc"
          staticIndicator={isMobile}
          className={depth >= 3 ? 'pl-8' : 'pl-5'}
        >
          {text}
        </SpyNavItem>
      ))}
    </nav>
  );
}
