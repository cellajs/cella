import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'shared/utils/nanoid';
import { scrollToSectionById } from '~/hooks/scroll-spy-store';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useCurrentSection } from '~/hooks/use-scroll-spy';
import type { TKey } from '~/lib/i18n-locales';
import type { LegalSubject } from '~/modules/auth/legal/legal-config';
import { type LegalSectionConfig, legalOverviewId } from '~/modules/auth/legal/legal-types';
import { expandRowLinkClass, handleExpandKeys, RowExpandToggle } from '~/modules/common/row-expand-toggle';
import { SpyNavItem } from '~/modules/common/spy-nav-item';
import { Collapsible, CollapsibleContent, collapsiblePanelClass } from '~/modules/ui/collapsible';
import { cn } from '~/utils/cn';

interface LegalSubjectConfig {
  id: LegalSubject;
  label: TKey;
  sections: readonly LegalSectionConfig[];
}

interface LegalAsideProps {
  subjects: LegalSubjectConfig[];
  currentSubject: LegalSubject;
  className?: string;
}

export function LegalAside({ subjects, currentSubject, className }: LegalAsideProps) {
  const { t } = useTranslation();

  const isMobile = useBreakpointBelow('sm');

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
  const currentSection = spySection || legalOverviewId;

  return (
    <div className={cn('mb-6 flex w-full flex-col gap-2', className)}>
      {subjects.map(({ id, label, sections }) => {
        const isActive = id === currentSubject;
        const isExpanded = expanded === id;
        const subjectSections = sections.filter((section) => section.label);
        // Collapsing is a re-click at the subject's overview. Further down, the link scrolls back up and the subject stays open.
        const isAtSubject = isActive && currentSection === legalOverviewId;
        const toggle = () => toggleExpanded(id);

        return (
          <Collapsible key={id} open={isExpanded}>
            <div className="group/subject relative" data-active={isActive} data-expanded={isExpanded}>
              <div className="group/expand-row relative">
                <Link
                  to="/legal/$subject"
                  params={{ subject: id }}
                  hash={isMobile ? '' : legalOverviewId}
                  hashScrollIntoView={{ behavior: 'instant' }}
                  resetScroll
                  draggable={false}
                  aria-expanded={isExpanded}
                  onKeyDown={(event) => handleExpandKeys(event, isExpanded, toggle)}
                  onClick={() => {
                    if (!isExpanded || isAtSubject) toggle();
                    // A link to the current subject only changes the hash, which doesn't scroll
                    if (isActive && !isAtSubject) requestAnimationFrame(() => scrollToSectionById(legalOverviewId));
                  }}
                  className={cn(
                    expandRowLinkClass,
                    'focus-inset w-full justify-start pr-9 pl-5 text-left font-medium group-data-[active=true]/subject:bg-accent group-data-[active=true]/subject:font-semibold',
                  )}
                >
                  {/* Caps the guideline, so it shows only alongside it: same color, on its center line, expanded only */}
                  {isActive && isExpanded && <div className="absolute left-[0.53rem] size-1 rounded-full bg-muted-foreground/30" />}
                  <span className="truncate">{t(label)}</span>
                </Link>
                <RowExpandToggle isExpanded={isExpanded} onToggle={toggle} />
              </div>
              {/* After the row, so a hover or active fill never covers the rail */}
              <div className="pointer-events-none absolute top-5.5 bottom-3 left-2.5 hidden flex-col items-center group-data-[expanded=true]/subject:flex">
                <div className="w-px flex-1 bg-muted-foreground/30" />
              </div>
              {/* keepMounted preserves the data-spy-active marks the scroll spy sets on rows outside React */}
              <CollapsibleContent keepMounted className={collapsiblePanelClass}>
                <div className="flex flex-col py-1">
                  {subjectSections.map(({ id: sectionId, label: sectionLabel }) => (
                    <SpyNavItem
                      key={sectionId}
                      id={sectionId}
                      isActive={isActive && currentSection === sectionId}
                      layoutId={layoutId}
                      group="section"
                      staticIndicator={isMobile}
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
