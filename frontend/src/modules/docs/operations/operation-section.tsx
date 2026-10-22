import { ChevronDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { collapsiblePanelClass } from '~/modules/docs/collapsible-panel';
import { Button } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';

interface OperationSectionProps {
  title: string;
  children: ReactNode;
}

/** A part of an operation's detail, such as its request or responses, open by default. */
export function OperationSection({ title, children }: OperationSectionProps) {
  return (
    <Collapsible defaultOpen className="mt-8">
      <CollapsibleTrigger
        nativeButton
        render={
          <Button variant="ghost" size="sm" className="group/operation-section w-full justify-start gap-2">
            <span>{title}</span>
            <ChevronDownIcon className="opacity-40 transition-transform duration-200 group-hover/operation-section:opacity-70 group-data-panel-open/operation-section:rotate-180" />
          </Button>
        }
      />
      <CollapsibleContent className={collapsiblePanelClass}>{children}</CollapsibleContent>
    </Collapsible>
  );
}
