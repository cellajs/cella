import { Link } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'shared/utils/nanoid';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useCurrentSection } from '~/hooks/use-scroll-spy';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import type { LegalSubject } from '~/modules/auth/legal/legal-config';
import type { LegalSection } from '~/modules/auth/legal/legal-types';
import { Button, buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { cn } from '~/utils/cn';

interface LegalSubjectConfig {
  id: LegalSubject;
  label: string;
  sections: readonly LegalSection[];
}

interface LegalAsideProps {
  /** Array of legal subjects with their sections */
  subjects: LegalSubjectConfig[];
  /** Currently active subject ID */
  currentSubject: LegalSubject;
  className?: string;
}

/**
 * Legal Aside Component that shows collapsible subjects with section navigation.
 * Receives sections from config.
 */
export const LegalAside = ({ subjects, currentSubject, className }: LegalAsideProps) => {
  const { t } = useTranslation();

  const isMobile = useBreakpointBelow('sm');

  // Unique layoutId for the animated indicator
  const [layoutId] = useState(() => nanoid());

  // Track which subject is expanded and the previous subject to detect changes
  const [expanded, setExpanded] = useState<LegalSubject | null>(currentSubject);
  const [prevSubject, setPrevSubject] = useState(currentSubject);

  // When currentSubject changes, expand it (sync update during render)
  if (prevSubject !== currentSubject) {
    setExpanded(currentSubject);
    setPrevSubject(currentSubject);
  }

  // Toggle expanded state for a subject
  const toggleExpanded = (id: LegalSubject) => {
    setExpanded((prev) => (prev === id ? null : id));
  };

  // Get current section from scroll spy store
  const spySection = useCurrentSection();
  const currentSection = spySection || 'overview';

  return (
    <div className={cn('mb-6 flex w-full flex-col gap-2', className)}>
      {subjects.map(({ id, label, sections }) => {
        const isActive = id === currentSubject;
        const isExpanded = expanded === id;
        // Only show sections with labels in the sidebar
        const subjectSections = sections.filter((s) => s.label);

        return (
          <Collapsible key={id} open={isExpanded} onOpenChange={() => toggleExpanded(id)}>
            <div className="group/subject relative" data-active={isActive} data-expanded={isExpanded}>
              {/* Rail line - visible when expanded */}
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
                  {subjectSections.map(({ id: sectionId, label: sectionLabel }) => {
                    const isSectionActive = isActive && currentSection === sectionId;
                    return (
                      <div
                        key={sectionId}
                        className="group/section relative"
                        data-spy-link={sectionId}
                        data-active={isSectionActive}
                      >
                        {isSectionActive && (
                          <motion.span
                            layoutId={layoutId}
                            transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
                            className="absolute top-2 bottom-2 left-2 ml-px w-[0.20rem] rounded-full bg-primary"
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            'group h-8 w-full justify-start gap-2 pl-5 text-left font-normal text-sm opacity-75 hover:bg-accent/50',
                            'group-data-[spy-active]/section:opacity-100',
                          )}
                          render={
                            <Link
                              to="."
                              hash={sectionId}
                              replace
                              draggable={false}
                              onClick={(e) => {
                                if (e.metaKey || e.ctrlKey) return;
                                e.preventDefault();
                                scrollToSectionById(sectionId);
                              }}
                            />
                          }
                        >
                          <span className="truncate text-sm">{sectionLabel}</span>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
};
