import { type ReactNode, Suspense } from 'react';
import { usePrerenderSection } from '~/hooks/use-prerender';
import { HashUrlButton } from '~/modules/common/hash-url-button';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { Collapsible, CollapsibleContent } from '~/modules/ui/collapsible';
import { cn } from '~/utils/cn';

interface TagSectionCardProps {
  scope: 'operations' | 'schemas';
  name: string;
  /** Scroll-spy section id of the tag, which the copied link points to. */
  sectionId: string;
  description?: string;
  isOpen: boolean;
  /** The tag's table and expand link. */
  children: ReactNode;
  /** The tag's full list below the card, prerendered with content-visibility: hidden on hover. */
  details: ReactNode;
}

/** One tag of an API reference page: a card with its table, and its details list that opens below it. */
export function TagSectionCard({ scope, name, sectionId, description, isOpen, children, details }: TagSectionCardProps) {
  const { shouldMount, style } = usePrerenderSection(scope, name, isOpen);

  return (
    <Collapsible open={isOpen}>
      <Card id={`spy-${sectionId}`} className={cn('border-0', isOpen && 'rounded-b-none')}>
        <CardHeader className="group/hash-url">
          <CardTitle level={2} className="gap-2 text-2xl leading-12">
            <HighlightText text={name} />
            <HashUrlButton hash={sectionId} />
          </CardTitle>
          {description && <CardDescription className="my-2 max-w-measure text-base">{description}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>

      {shouldMount && (
        <CollapsibleContent keepMounted>
          <div style={style}>
            <Suspense>{details}</Suspense>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
