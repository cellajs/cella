import { Link } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'shared/utils/nanoid';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useCurrentSection } from '~/hooks/use-scroll-spy';
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

        return (
          <Collapsible key={id} open={isExpanded} onOpenChange={() => toggleExpanded(id)}>
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
              <CollapsibleContent keepMounted className="overflow-hidden data-closed:hidden">
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
