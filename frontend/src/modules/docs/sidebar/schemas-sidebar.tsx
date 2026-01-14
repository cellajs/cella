import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useMemo, useRef } from 'react';
import { scrollToSectionById } from '~/hooks/scroll-spy-store';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { schemasQueryOptions, schemaTagsQueryOptions } from '~/modules/docs/query';
import type { GenComponentSchema, GenSchemaTagSummary, SchemaTag } from '~/modules/docs/types';
import { buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { SidebarMenu, SidebarMenuItem } from '~/modules/ui/sidebar';
import { cn } from '~/utils/cn';
import { nanoid } from '~/utils/nanoid';
import { useSheeter } from '../../common/sheeter/use-sheeter';

type SchemaItemProps = {
  schema: GenComponentSchema;
  tagName: string;
  layoutId: string;
  isMobile: boolean;
};

/** Individual schema item - subscribes to location independently to minimize re-renders */
const SchemaItem = memo(({ schema, tagName, layoutId, isMobile }: SchemaItemProps) => {
  const { hash } = useLocation();
  const schemaId = schema.ref.replace(/^#/, '');
  const isActive = hash === schemaId;

  return (
    <div className="relative group/schema" data-active={isActive}>
      {isActive && (
        <motion.span
          layoutId={layoutId}
          transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
          className="w-[0.20rem] bg-primary rounded-full absolute left-2 ml-px top-2 bottom-2"
        />
      )}
      <Link
        to="/docs/schemas"
        search={{ schemaTag: tagName as SchemaTag }}
        hash={schemaId}
        replace
        draggable="false"
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'hover:bg-accent/50 w-full justify-start text-left group font-normal opacity-75 text-sm h-8 gap-2 pl-5',
          'group-data-[active=true]/schema:opacity-100',
        )}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          scrollToSectionById(schemaId);
          isMobile && useSheeter.getState().remove();
        }}
      >
        <span className="truncate text-[13px]">{schema.name}</span>
      </Link>
    </div>
  );
});

type SchemaTagItemProps = {
  tag: GenSchemaTagSummary;
  schemas: GenComponentSchema[];
  isExpanded: boolean;
  layoutId: string;
  isMobile: boolean;
};

/** Individual schema tag collapsible item - subscribes to location independently */
const SchemaTagItem = memo(({ tag, schemas, isExpanded, layoutId, isMobile }: SchemaTagItemProps) => {
  const { hash } = useLocation();
  const childSchemaIds = schemas.map((s) => s.ref.replace(/^#/, ''));
  const isActive = hash === tag.name || childSchemaIds.includes(hash);

  return (
    <Collapsible open={isExpanded}>
      <SidebarMenuItem className="relative group/tag" data-expanded={isExpanded} data-active={isActive}>
        {/* Rail line - visible when expanded */}
        <div className="absolute left-2.5 top-4.5 bottom-3 flex-col items-center pointer-events-none hidden group-data-[expanded=true]/tag:flex">
          <div className="w-px flex-1 bg-muted-foreground/30" />
        </div>
        {/* Schema tag section button */}
        <CollapsibleTrigger asChild>
          <Link
            to="/docs/schemas"
            search={(prev) => ({ ...prev, schemaTag: isExpanded ? undefined : (tag.name as SchemaTag) })}
            hash={isExpanded ? undefined : tag.name}
            replace
            resetScroll={false}
            hashScrollIntoView={{ behavior: 'instant' }}
            draggable="false"
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'default' }),
              'w-full justify-start pl-5 h-8 font-normal group lowercase opacity-80',
              'group-data-[expanded=true]/tag:opacity-100 group-data-[active=true]/tag:bg-accent',
            )}
          >
            <div className="absolute left-[0.53rem] w-1 h-1 rounded-full bg-muted-foreground/30 group-data-[expanded=true]/tag:bg-muted-foreground/60" />
            <span>{tag.name}</span>
            <span className="ml-2 text-xs text-muted-foreground/90 font-light opacity-0 sm:group-hover:opacity-100 transition-opacity group-data-[expanded=true]/tag:hidden">
              {tag.count}
            </span>
            <ChevronDownIcon className="size-4 invisible group-hover:visible transition-transform duration-200 opacity-40 ml-auto group-data-[expanded=true]/tag:rotate-180" />
          </Link>
        </CollapsibleTrigger>
        {/* Schema list */}
        <CollapsibleContent forceMount className="overflow-hidden data-[state=closed]:hidden">
          <div className="relative flex flex-col py-1 px-0">
            {schemas.map((schema) => (
              <SchemaItem
                key={schema.name}
                schema={schema}
                tagName={tag.name}
                layoutId={layoutId}
                isMobile={isMobile}
              />
            ))}
          </div>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
});

/**
 * Sidebar menu listing schema tags, each with their schema lists.
 * Uses URL hash to track and highlight the currently visible schema.
 */
export function SchemasSidebar() {
  const layoutId = useRef(nanoid()).current;
  const isMobile = useBreakpoints('max', 'sm');

  // Fetch schemas and schema tags via React Query
  const { data: schemas } = useSuspenseQuery(schemasQueryOptions);
  const { data: schemaTags } = useSuspenseQuery(schemaTagsQueryOptions);

  // Get active tag from URL search params (strict: false for fuzzy route matching)
  const { schemaTag: activeTag } = useSearch({ strict: false });

  // Pre-group schemas by tag to avoid filtering on every render
  const schemasByTag = useMemo(() => {
    const grouped = new Map<string, typeof schemas>();
    for (const schema of schemas) {
      if (schema.schemaTag) {
        const existing = grouped.get(schema.schemaTag) ?? [];
        existing.push(schema);
        grouped.set(schema.schemaTag, existing);
      }
    }
    return grouped;
  }, [schemas]);

  return (
    <SidebarMenu className="gap-1 p-0 pt-1">
      {schemaTags.map((tag) => (
        <SchemaTagItem
          key={tag.name}
          tag={tag}
          schemas={schemasByTag.get(tag.name) ?? []}
          isExpanded={activeTag === tag.name}
          layoutId={layoutId}
          isMobile={isMobile}
        />
      ))}
    </SidebarMenu>
  );
}
