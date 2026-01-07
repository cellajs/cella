import { Link } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import type { LegalSection, LegalSubject } from '~/modules/marketing/legal/legal-config';
import { buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { cn } from '~/utils/cn';
import { nanoid } from '~/utils/nanoid';

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

  const isMobile = useBreakpoints('max', 'sm');

  // Unique layoutId for the animated indicator
  const layoutId = useRef(nanoid()).current;

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

  // Get sections for current subject
  const currentSections = subjects.find((s) => s.id === currentSubject)?.sections || [];

  // All section IDs for scroll spy (including those without labels)
  const sectionIds = currentSections.map((s) => s.id);
  const { currentSection, scrollToSection } = useScrollSpy({
    sectionIds,
    enableWriteHash: !isMobile,
    smoothScroll: false,
  });

  return (
    <div className={cn('w-full flex flex-col gap-2 mb-6', className)}>
      {subjects.map(({ id, label, sections }) => {
        const isActive = id === currentSubject;
        const isExpanded = expanded === id;
        // Only show sections with labels in the sidebar
        const subjectSections = sections.filter((s) => s.label);

        return (
          <Collapsible key={id} open={isExpanded} onOpenChange={() => toggleExpanded(id)}>
            <CollapsibleTrigger asChild>
              <Link
                to="/legal/$subject"
                params={{ subject: id }}
                hash={isMobile ? '' : 'overview'}
                hashScrollIntoView={{ behavior: 'instant' }}
                resetScroll={true}
                draggable="false"
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'lg' }),
                  'w-full justify-between text-left',
                  isActive && 'bg-accent',
                )}
              >
                <div className="truncate">{t(label)}</div>
                <ChevronRightIcon
                  className={cn('size-4 transition-transform duration-200', isExpanded && 'rotate-90')}
                />
              </Link>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
              <div className="relative flex flex-col py-2 ml-3 pl-4">
                {/* Faded rail line */}
                <div className="absolute left-0 top-4 bottom-4 w-px bg-muted-foreground/20 rounded-full" />
                {subjectSections.map(({ id: sectionId, label: sectionLabel }) => {
                  const isSectionActive = isActive && currentSection === sectionId;
                  return (
                    <div key={sectionId} className="relative">
                      {isSectionActive && (
                        <motion.span
                          layoutId={layoutId}
                          transition={{ type: 'spring', duration: 0.4, bounce: 0, delay: 0.1 }}
                          className="w-[0.20rem] bg-primary rounded-full absolute -left-4.5 ml-px top-2 bottom-2"
                        />
                      )}
                      <Link
                        to="."
                        hash={sectionId}
                        replace
                        draggable="false"
                        className={cn(
                          buttonVariants({ variant: 'ghost', size: 'sm' }),
                          'hover:bg-accent/50 w-full justify-start text-left text-sm font-light',
                          isSectionActive && 'font-normal',
                        )}
                        onClick={(e) => {
                          e.preventDefault();
                          scrollToSection(sectionId);
                        }}
                      >
                        <div className="truncate">{sectionLabel}</div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
};
