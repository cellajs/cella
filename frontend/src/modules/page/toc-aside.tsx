import { TextAlignStartIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'shared/utils/nanoid';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useCurrentSection } from '~/hooks/use-scroll-spy';
import { SpyNavItem } from '~/modules/common/spy-nav-item';
import type { DocHeading } from '~/modules/page/content';
import { cn } from '~/utils/cn';

interface TocAsideProps {
  headings: DocHeading[];
  className?: string;
}

/** "On this page" nav: page headings with a cursor bar driven by the scroll spy store; view-page.tsx registers the sections. */
export function TocAside({ headings, className }: TocAsideProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm', false);
  const [layoutId] = useState(() => nanoid());
  const currentSection = useCurrentSection();

  return (
    <nav className={cn('flex w-full flex-col', className)} aria-label={t('c:docs.on_this_page')}>
      <span aria-hidden="true" className="flex pr-3 pb-2 pl-5 text-muted-foreground">
        <TextAlignStartIcon />
      </span>
      <div className="relative flex flex-col">
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
      </div>
    </nav>
  );
}
