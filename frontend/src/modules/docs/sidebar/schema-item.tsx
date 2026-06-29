import { Link } from '@tanstack/react-router';
import { memo } from 'react';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import type { GenComponentSchema } from '~/modules/docs/types';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { useSheeter } from '../../common/sheeter/use-sheeter';

type SchemaItemProps = {
  schema: GenComponentSchema;
  isActive: boolean;
};

function SchemaItemBase({ schema, isActive }: SchemaItemProps) {
  const schemaId = schema.ref.replace(/^#/, '');

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'h-8 w-full justify-start gap-2 pl-5 text-left font-normal text-sm opacity-70 hover:bg-accent/50',
        'data-[active=true]:opacity-100',
      )}
      render={
        <Link
          to="/docs/schemas"
          hash={schemaId}
          replace
          draggable={false}
          data-active={isActive}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            scrollToSectionById(schemaId);
            useSheeter.getState().remove('docs-sidebar');
          }}
        />
      }
    >
      <span className="truncate text-sm">{schema.name}</span>
    </Button>
  );
}

function schemaItemEqual(prev: SchemaItemProps, next: SchemaItemProps) {
  return prev.schema === next.schema && prev.isActive === next.isActive;
}

export const SchemaItem = memo(SchemaItemBase, schemaItemEqual);
