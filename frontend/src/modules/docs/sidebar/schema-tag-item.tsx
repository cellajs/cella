import { Link } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { memo } from 'react';
import { scrollToSectionById } from '~/hooks/scroll-spy-store';
import type { GenComponentSchema, GenSchemaTagSummary, SchemaTag } from '~/modules/docs/types';
import { buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { SidebarMenuItem } from '~/modules/ui/sidebar';
import { cn } from '~/utils/cn';
import { useSheeter } from '../../common/sheeter/use-sheeter';
import { SchemaItem } from './schema-item';

const ITEM_HEIGHT = 32;
const LIST_PADDING_TOP = 4;
const DOCS_SIDEBAR_SHEET_ID = 'docs-sidebar';

type SchemaTagItemProps = {
  tag: GenSchemaTagSummary;
  schemas: GenComponentSchema[];
  isExpanded: boolean;
  layoutId: string;
  isActive: boolean;
  activeSchemaIndex: number;
};

function schemaTagItemEqual(prev: SchemaTagItemProps, next: SchemaTagItemProps) {
  return (
    prev.isActive === next.isActive &&
    prev.isExpanded === next.isExpanded &&
    prev.activeSchemaIndex === next.activeSchemaIndex &&
    prev.tag === next.tag &&
    prev.schemas === next.schemas
  );
}

function SchemaTagItemBase({ tag, schemas, isExpanded, layoutId, isActive, activeSchemaIndex }: SchemaTagItemProps) {
  return (
    <Collapsible open={isExpanded}>
      <SidebarMenuItem className="relative group/tag" data-expanded={isExpanded} data-active={isActive}>
        <div className="absolute left-2.5 top-4.5 bottom-3 flex-col items-center pointer-events-none hidden group-data-[expanded=true]/tag:flex">
          <div className="w-px flex-1 bg-muted-foreground/30" />
        </div>
        <CollapsibleTrigger asChild>
          <Link
            to="/docs/schemas"
            search={(prev) => ({ ...prev, schemaTag: isExpanded ? undefined : (tag.name as SchemaTag) })}
            hash={isExpanded ? undefined : tag.name}
            replace
            resetScroll={false}
            draggable="false"
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'default' }),
              'w-full justify-start pl-5 h-8 font-normal group lowercase opacity-80',
              'group-data-[expanded=true]/tag:opacity-100 group-data-[active=true]/tag:bg-accent',
            )}
            onClick={() => {
              if (!isExpanded) requestAnimationFrame(() => scrollToSectionById(tag.name));
              useSheeter.getState().remove(DOCS_SIDEBAR_SHEET_ID);
            }}
          >
            <div className="absolute left-[0.53rem] w-1 h-1 rounded-full bg-muted-foreground/30 group-data-[expanded=true]/tag:bg-muted-foreground/60" />
            <span>{tag.name}</span>
            <span className="ml-2 text-xs text-muted-foreground/90 font-light opacity-0 sm:group-hover:opacity-100 transition-opacity group-data-[expanded=true]/tag:hidden">
              {tag.count}
            </span>
            <ChevronDownIcon className="size-4 invisible group-hover:visible transition-transform duration-200 opacity-40 ml-auto group-data-[expanded=true]/tag:rotate-180" />
          </Link>
        </CollapsibleTrigger>
        <CollapsibleContent forceMount className="overflow-hidden data-[state=closed]:hidden">
          <div className="relative flex flex-col py-1 px-0">
            {activeSchemaIndex >= 0 && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
                className="w-[0.20rem] bg-primary rounded-full absolute left-2 ml-px"
                style={{
                  top: LIST_PADDING_TOP + activeSchemaIndex * ITEM_HEIGHT + 8,
                  height: ITEM_HEIGHT - 16,
                }}
              />
            )}
            {schemas.map((schema, index) => (
              <SchemaItem key={schema.name} schema={schema} isActive={activeSchemaIndex === index} />
            ))}
          </div>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export const SchemaTagItem = memo(SchemaTagItemBase, schemaTagItemEqual);
