import { Link } from '@tanstack/react-router';
import { memo } from 'react';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import type { GenComponentSchema } from '~/modules/docs/types';
import { buttonVariants } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { useSheeter } from '../../common/sheeter/use-sheeter';

type SchemaItemProps = {
  schema: GenComponentSchema;
  isActive: boolean;
};

function SchemaItemBase({ schema, isActive }: SchemaItemProps) {
  const schemaId = schema.ref.replace(/^#/, '');

  return (
    <Link
      to="/docs/schemas"
      hash={schemaId}
      replace
      draggable="false"
      data-active={isActive}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'sm' }),
        'hover:bg-accent/50 w-full justify-start text-left pl-5 font-normal opacity-70 text-sm h-8 gap-2',
        'data-[active=true]:opacity-100',
      )}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        scrollToSectionById(schemaId);
        useSheeter.getState().remove('docs-sidebar');
      }}
    >
      <span className="truncate text-[13px]">{schema.name}</span>
    </Link>
  );
}

function schemaItemEqual(prev: SchemaItemProps, next: SchemaItemProps) {
  return prev.schema === next.schema && prev.isActive === next.isActive;
}

export const SchemaItem = memo(SchemaItemBase, schemaItemEqual);
