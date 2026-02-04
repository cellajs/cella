import { Link, useLocation } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
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

  // Get current section from URL hash
  const { hash } = useLocation();
  const currentSection = hash || 'overview';

  return (
    <div className={cn('w-full flex flex-col gap-2 mb-6', className)}>
      {subjects.map(({ id, label, sections }) => {
        const isActive = id === currentSubject;
        const isExpanded = expanded === id;
        // Only show sections with labels in the sidebar
        const subjectSections = sections.filter((s) => s.label);

        return (
          <Collapsible key={id} open={isExpanded} onOpenChange={() => toggleExpanded(id)}>
            <div className="relative group/subject" data-active={isActive} data-expanded={isExpanded}>
              {/* Rail line - visible when expanded */}
              <div className="absolute left-2.5 top-4.5 bottom-3 flex-col items-center pointer-events-none hidden group-data-[expanded=true]/subject:flex">
                <div className="w-px flex-1 bg-muted-foreground/30" />
              </div>
              <CollapsibleTrigger asChild>
                <Link
                  to="/legal/$subject"
                  params={{ subject: id }}
                  hash={isMobile ? '' : 'overview'}
                  hashScrollIntoView={{ behavior: 'instant' }}
                  resetScroll={true}
                  draggable="false"
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'default' }),
                    'w-full text-left pl-5 h-8 font-normal group opacity-80',
                    'group-data-[expanded=true]/subject:opacity-100 group-data-[active=true]/subject:bg-accent',
                  )}
                >
                  <div className="absolute left-[0.53rem] w-1 h-1 rounded-full bg-muted-foreground/30 group-data-[expanded=true]/subject:bg-muted-foreground/60" />
                  <span className="truncate">{t(label)}</span>
                  <ChevronDownIcon className="size-4 invisible group-hover:visible transition-transform duration-200 opacity-40 ml-auto group-data-[expanded=true]/subject:rotate-180" />
                </Link>
              </CollapsibleTrigger>
              <CollapsibleContent forceMount className="overflow-hidden data-[state=closed]:hidden">
                <div className="relative flex flex-col py-1 px-0">
                  {subjectSections.map(({ id: sectionId, label: sectionLabel }) => {
                    const isSectionActive = isActive && currentSection === sectionId;
                    return (
                      <div key={sectionId} className="relative group/section" data-active={isSectionActive}>
                        {isSectionActive && (
                          <motion.span
                            layoutId={layoutId}
                            transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
                            className="w-[0.20rem] bg-primary rounded-full absolute left-2 ml-px top-2 bottom-2"
                          />
                        )}
                        <Link
                          to="."
                          hash={sectionId}
                          replace
                          draggable="false"
                          className={cn(
                            buttonVariants({ variant: 'ghost', size: 'sm' }),
                            'hover:bg-accent/50 w-full justify-start text-left group font-normal opacity-75 text-sm h-8 gap-2 pl-5',
                            'group-data-[active=true]/section:opacity-100',
                          )}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey) return;
                            e.preventDefault();
                            scrollToSectionById(sectionId);
                          }}
                        >
                          <span className="truncate text-[13px]">{sectionLabel}</span>
                        </Link>
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
