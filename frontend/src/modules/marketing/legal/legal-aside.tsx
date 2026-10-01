import { Link } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'shared/utils/nanoid';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useCurrentSection } from '~/hooks/use-scroll-spy';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import type { TKey } from '~/lib/i18n-locales';
import type { LegalSubject } from '~/modules/auth/legal/legal-config';
import type { LegalSection } from '~/modules/auth/legal/legal-types';
import { SpyNavItem } from '~/modules/common/spy-nav-item';
import { buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { cn } from '~/utils/cn';

interface LegalSubjectConfig {
  id: LegalSubject;
  label: TKey;
  sections: readonly LegalSection[];
}

interface LegalAsideProps {
  subjects: LegalSubjectConfig[];
  currentSubject: LegalSubject;
  className?: string;
}

export function LegalAside({ subjects, currentSubject, className }: LegalAsideProps) {
  const { t } = useTranslation();

  const isMobile = useBreakpointBelow('sm');
  // Below `md` the aside stacks above the legal text, so a height animation would relayout the text every frame
  const isStacked = useBreakpointBelow('md', false);

  const [layoutId] = useState(() => nanoid());

  const [expanded, setExpanded] = useState<LegalSubject | null>(currentSubject);
  const [prevSubject, setPrevSubject] = useState(currentSubject);

  // State update during render: expands the newly selected subject.
  if (prevSubject !== currentSubject) {
    setExpanded(currentSubject);
    setPrevSubject(currentSubject);
  }

  const toggleExpanded = (id: LegalSubject) => {
    setExpanded((prev) => (prev === id ? null : id));
  };

  const spySection = useCurrentSection();
  const currentSection = spySection || 'overview';

  return (
    <div className={cn('mb-6 flex w-full flex-col gap-2', className)}>
      {subjects.map(({ id, label, sections }) => {
        const isActive = id === currentSubject;
        const isExpanded = expanded === id;
        const subjectSections = sections.filter((s) => s.label);
        // Collapsing is a re-click at the subject's overview. Further down, the link scrolls back up and the subject stays open.
        const isAtSubject = isActive && currentSection === 'overview';

        return (
          <Collapsible
            key={id}
            open={isExpanded}
            onOpenChange={(open) => {
              if (open || isAtSubject) toggleExpanded(id);
            }}
          >
            <div className="group/subject relative" data-active={isActive} data-expanded={isExpanded}>
              <div className="pointer-events-none absolute top-4.5 bottom-3 left-2.5 hidden flex-col items-center group-data-[expanded=true]/subject:flex">
                <div className="w-px flex-1 bg-muted-foreground/30" />
              </div>
              <CollapsibleTrigger
                render={
                  <Link
                    to="/legal/$subject"
                    params={{ subject: id }}
                    hash={isMobile ? '' : 'overview'}
                    hashScrollIntoView={{ behavior: 'instant' }}
                    resetScroll={true}
                    draggable={false}
                    // A link to the current subject only changes the hash, which doesn't scroll
                    onClick={() => {
                      if (isActive && !isAtSubject) requestAnimationFrame(() => scrollToSectionById('overview'));
                    }}
                    className={cn(
                      buttonVariants({ variant: 'ghost' }),
                      'group h-8 w-full pl-5 text-left font-normal opacity-80',
                      'group-data-[active=true]/subject:bg-accent group-data-[expanded=true]/subject:opacity-100',
                    )}
                  />
                }
              >
                <div className="absolute left-[0.53rem] h-1 w-1 rounded-full bg-muted-foreground/30 group-data-[expanded=true]/subject:bg-muted-foreground/60" />
                <span className="truncate">{t(label)}</span>
                <ChevronDownIcon className="invisible ml-auto size-4 opacity-40 transition-transform duration-200 group-hover:visible group-data-[expanded=true]/subject:rotate-180" />
              </CollapsibleTrigger>
              {/* keepMounted preserves the data-spy-active marks the scroll spy sets on rows outside React */}
              <CollapsibleContent
                keepMounted
                className={cn('overflow-hidden', !isStacked && 'data-closed:animate-collapsible-up data-open:animate-collapsible-down')}
              >
                <div className="relative flex flex-col px-0 py-1">
                  {subjectSections.map(({ id: sectionId, label: sectionLabel }) => (
                    <SpyNavItem
                      key={sectionId}
                      id={sectionId}
                      isActive={isActive && currentSection === sectionId}
                      layoutId={layoutId}
                      group="section"
                      className="pl-5"
                    >
                      {sectionLabel}
                    </SpyNavItem>
                  ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}
