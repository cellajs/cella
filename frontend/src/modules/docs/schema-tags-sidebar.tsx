import { Link, useRouterState } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef } from 'react';
import type { SchemaTag } from '~/api.gen/docs';
import { schemas, schemaTags } from '~/api.gen/docs';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { SidebarMenu, SidebarMenuItem } from '~/modules/ui/sidebar';
import { cn } from '~/utils/cn';
import { nanoid } from '~/utils/nanoid';

/**
 * Sidebar menu listing schema tags with collapsible schema lists.
 * Uses scroll spy to track and highlight the currently visible schema.
 */
export function SchemaTagsSidebar() {
  const isMobile = useBreakpoints('max', 'sm');
  const layoutId = useRef(nanoid()).current;

  // Get active schema tag from URL search params (works regardless of current route)
  const { location } = useRouterState();
  const isSchemasRoute = location.pathname.includes('/docs/schemas');
  const searchParams = location.search as { schemaTag?: SchemaTag };
  const activeSchemaTag = isSchemasRoute ? searchParams.schemaTag : undefined;

  const getSchemasByTag = (tagName: string) => {
    return schemas.filter((s) => s.schemaTag === tagName);
  };

  // Schema tag section IDs and individual schema refs
  const schemaTagIds = schemaTags.map((t) => t.name);
  const schemaRefs = schemas.map((s) => s.ref.replace(/^#/, ''));
  const allSectionIds = [...schemaTagIds, ...schemaRefs];

  const { currentSection, scrollToSection } = useScrollSpy({
    sectionIds: allSectionIds,
    enableWriteHash: !isMobile,
    smoothScroll: false,
  });

  return (
    <SidebarMenu className="gap-1 p-0 pt-1">
      {schemaTags.map((tag) => {
        const isExpanded = activeSchemaTag === tag.name;
        const tagSchemas = getSchemasByTag(tag.name);
        // Tag is active if currentSection matches the tag name or any of its child schemas
        const childSchemaIds = tagSchemas.map((s) => s.ref.replace(/^#/, ''));
        const isActive = currentSection === tag.name || childSchemaIds.includes(currentSection);

        return (
          <Collapsible key={tag.name} open={isExpanded}>
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
                  {/* Dot indicator - always visible, increases opacity when expanded */}
                  <div className="absolute left-[0.53rem] w-1 h-1 rounded-full bg-muted-foreground/30 group-data-[expanded=true]/tag:bg-muted-foreground/60" />
                  <span>{tag.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground/90 font-light opacity-0 group-hover:opacity-100 transition-opacity group-data-[expanded=true]/tag:hidden">
                    {tag.count}
                  </span>
                  <ChevronDownIcon className="size-4 invisible group-hover:visible transition-transform duration-200 opacity-40 ml-auto group-data-[expanded=true]/tag:rotate-180" />
                </Link>
              </CollapsibleTrigger>
              {/* Schema list */}
              <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                <div className="relative flex flex-col py-1 px-0">
                  {tagSchemas.map((schema) => {
                    const schemaId = schema.ref.replace(/^#/, '');
                    const isActive = currentSection === schemaId;
                    return (
                      <div key={schema.name} className="relative group/schema" data-active={isActive}>
                        {isActive && (
                          <motion.span
                            layoutId={layoutId}
                            transition={{ type: 'spring', duration: 0.4, bounce: 0, delay: 0.1 }}
                            className="w-[0.20rem] bg-primary rounded-full absolute left-2 ml-px top-2 bottom-2"
                          />
                        )}
                        {/* Schema link button */}
                        <Link
                          to="/docs/schemas"
                          search={{ schemaTag: tag.name as SchemaTag }}
                          hash={schemaId}
                          replace
                          draggable="false"
                          className={cn(
                            buttonVariants({ variant: 'ghost', size: 'sm' }),
                            'hover:bg-accent/50 w-full justify-start text-left group font-normal opacity-75 text-sm h-8 gap-2 pl-5',
                            'group-data-[active=true]/schema:opacity-100',
                          )}
                          onClick={(e) => {
                            e.preventDefault();
                            scrollToSection(schemaId);
                          }}
                        >
                          <span className="truncate text-[13px]">{schema.name}</span>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        );
      })}
    </SidebarMenu>
  );
}
