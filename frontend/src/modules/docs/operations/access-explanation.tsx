import { Link } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createPopoverHandle, Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { cn } from '~/utils/cn';

/** One thing an operation's access depends on: a proof, a guard, a limit, a scope or its MCP tool. */
export interface AccessValue {
  value: string;
  name: string;
  /** What it means for a caller; without it the value stays plain text. */
  description?: string;
  /** The name to look it up by in the code or the spec. */
  code?: string;
  /** Adds the link to the permissions page. */
  isGuard?: boolean;
}

/** The dotted underline that marks a value with an explanation behind it. */
export const explainedUnderline = 'underline decoration-foreground/40 decoration-dotted underline-offset-3 hover:decoration-foreground';

const triggerClass = 'focus-effect cursor-pointer rounded-xs pointer-coarse:py-1.5';

/** Hover opens it, as do a tap and Enter; the delay lets the pointer cross the gap to the card and stay. */
const openBehavior = { openOnHover: true, closeDelay: 150 };

const cardProps = {
  side: 'bottom',
  align: 'start',
  collisionPadding: 16,
  className: 'flex w-75 max-w-[calc(100vw-2rem)] flex-col gap-3 p-3',
} as const;

function Explanations({ items }: { items: AccessValue[] }) {
  const { t } = useTranslation();

  return (
    <>
      {items.map(({ value, name, description, code }) => (
        <div key={value} className="flex flex-col gap-1">
          <p className="font-medium text-sm">{name}</p>
          <p className="text-pretty text-muted-foreground text-sm">{description}</p>
          {code && <code className="font-mono text-muted-foreground text-xs">{code}</code>}
        </div>
      ))}
      {items.some(({ isGuard }) => isGuard) && (
        <Link
          to="/docs/page/$"
          params={{ _splat: 'security/permissions' }}
          className="focus-effect w-fit rounded-xs text-sm underline underline-offset-3"
        >
          {t('c:docs.permissions_link')}
        </Link>
      )}
    </>
  );
}

interface ExplainedValueProps {
  item: AccessValue;
  /** Off while the same text is written out on the page. */
  enabled?: boolean;
  className?: string;
  children: ReactNode;
}

/** A value in an Access row that opens its explanation. */
export function ExplainedValue({ item, enabled = true, className, children }: ExplainedValueProps) {
  if (!enabled || !item.description) return children;

  return (
    <Popover>
      <PopoverTrigger {...openBehavior} className={cn(triggerClass, className)}>
        {children}
      </PopoverTrigger>
      <PopoverContent {...cardProps} aria-label={item.name}>
        <Explanations items={[item]} />
      </PopoverContent>
    </Popover>
  );
}

interface CellPayload {
  label: string;
  items: AccessValue[];
}

const cellHandle = createPopoverHandle<CellPayload>();

/** Past this length a cell shows its first value and a count, since the card lists them all. */
const maxCellText = 28;

interface AccessCellProps {
  /** The column's name, which labels the card. */
  label: string;
  items: AccessValue[];
  tabIndex: number;
}

/** A grid cell's values behind one trigger. The one popup they share lives in `AccessCellPopover`, so a hover never renders the grid. */
export function AccessCell({ label, items, tabIndex }: AccessCellProps) {
  const text = items.map(({ name }) => name).join(', ');
  const explained = items.filter(({ description }) => description);
  if (!explained.length) return <div className="truncate text-muted-foreground text-xs">{text}</div>;

  const isLong = items.length > 1 && text.length > maxCellText;

  return (
    <PopoverTrigger
      handle={cellHandle}
      payload={{ label, items: explained }}
      tabIndex={tabIndex}
      {...openBehavior}
      className={cn(
        triggerClass,
        'flex max-w-full items-center gap-1.5 text-left text-muted-foreground text-xs hover:text-foreground data-popup-open:text-foreground',
      )}
    >
      <span className={cn('truncate', explainedUnderline)}>{isLong ? items[0].name : text}</span>
      {isLong && <span className="shrink-0 rounded-full bg-muted px-1.5 text-muted-foreground">+{items.length - 1}</span>}
    </PopoverTrigger>
  );
}

/** The popup every `AccessCell` of a table opens. */
export function AccessCellPopover() {
  // A row scrolled out of the virtualized grid takes its trigger along, which would drop the card in the window's corner
  useEffect(() => {
    const close = () => cellHandle.close();
    window.addEventListener('scroll', close, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', close, { capture: true });
  }, []);

  return (
    <Popover handle={cellHandle}>
      {({ payload }) =>
        payload && (
          <PopoverContent {...cardProps} aria-label={payload.label}>
            <Explanations items={payload.items} />
          </PopoverContent>
        )
      }
    </Popover>
  );
}
