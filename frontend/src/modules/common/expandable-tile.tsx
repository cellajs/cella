import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { ChevronDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { IconComponent } from '~/modules/common/icons/types';
import { AccordionContent } from '~/modules/ui/accordion';
import { Card } from '~/modules/ui/card';
import { cn } from '~/utils/cn';

/** The color of a status: its dot and its word. */
export const tileTones = {
  success: { dot: 'bg-success', text: 'text-success' },
  info: { dot: 'bg-info', text: 'text-info' },
  warning: { dot: 'bg-warning', text: 'text-warning' },
  destructive: { dot: 'bg-destructive', text: 'text-destructive' },
  muted: { dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
};

export type TileTone = keyof typeof tileTones;

interface TileHeadProps {
  /** Sized by the tile. */
  icon: ReactNode;
  /** Without it the icon is decorative. */
  iconLabel?: string;
  title: ReactNode;
  badges?: ReactNode;
  /** A small icon on the icon's corner, where a status dot sits. */
  iconBadge?: IconComponent;
  /** A new `pulse` value ripples the dot. */
  status?: { tone: TileTone; label: string; pulse?: number };
  meta: ReactNode;
  wrapMeta?: boolean;
}

function TileHead({ icon, iconLabel, iconBadge: IconBadge, title, badges, status, meta, wrapMeta }: TileHeadProps) {
  return (
    <>
      {iconLabel && <span className="sr-only">{iconLabel}</span>}
      <span className="relative shrink-0 [&>img]:size-6 [&>svg]:size-6" aria-hidden="true">
        {icon}
        {/* Centered on the status dot's center; the card fill cuts it out of the icon */}
        {IconBadge && (
          <span className="bg-card absolute -right-1.25 -bottom-0.25 flex size-4 items-center justify-center rounded-full">
            <IconBadge className="size-3" />
          </span>
        )}
        {status && (
          <span className={cn('ring-card absolute -right-0.5 bottom-0.5 size-2.5 rounded-full ring-2', tileTones[status.tone].dot)}>
            {/* Inside the dot, so the ripple leaves the dot's ring in place */}
            {status.pulse !== undefined && (
              <span
                key={status.pulse}
                className={cn(
                  'animate-dot-landed absolute inset-0 rounded-full bg-current opacity-0 motion-reduce:animate-none',
                  tileTones[status.tone].text,
                )}
              />
            )}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium">{title}</span>
          {badges}
        </span>
        <span className={cn('text-muted-foreground text-sm', !wrapMeta && 'truncate')}>
          {status && (
            <>
              <span className={tileTones[status.tone].text}>{status.label}</span>
              {meta && ' · '}
            </>
          )}
          {meta}
        </span>
      </span>
    </>
  );
}

export interface ExpandableTileProps extends TileHeadProps {
  /** Unique among the tiles of its `Accordion`. */
  value: string;
  lead?: ReactNode;
  /** `ExpandableTileDetail`s. */
  details?: ReactNode;
  actions?: ReactNode;
  className?: string;
  panelClassName?: string;
}

/** A list item as a card that opens to its details and actions; an `Accordion` holds the tiles. */
export function ExpandableTile({ value, lead, details, actions, className, panelClassName, ...head }: ExpandableTileProps) {
  return (
    <AccordionPrimitive.Item
      value={value}
      render={
        <Card
          className={cn(
            'focus-ring:has-[>button:focus-visible]:ring-2 focus-ring:has-[>button:focus-visible]:ring-ring focus-ring:has-[>button:focus-visible]:ring-offset-2 focus-ring:has-[>button:focus-visible]:ring-offset-background gap-0 py-0 sm:gap-0 sm:py-0',
            className,
          )}
        />
      }
    >
      <AccordionPrimitive.Trigger className="group/expandable-tile flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left focus-visible:outline-hidden">
        <TileHead {...head} />
        <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-data-panel-open/expandable-tile:rotate-180" />
      </AccordionPrimitive.Trigger>
      {/* pl-12 lines up with the title: px-3, the size-6 icon and gap-3 */}
      <AccordionContent className={cn('flex flex-col gap-3 pr-3 pb-3 pl-12', panelClassName)}>
        {lead}
        {details && <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">{details}</dl>}
        {actions && <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{actions}</div>}
      </AccordionContent>
    </AccordionPrimitive.Item>
  );
}

interface ExpandableTileDetailProps {
  label: string;
  /** Full width, and wraps. */
  wide?: boolean;
  children: ReactNode;
}

export function ExpandableTileDetail({ label, wide, children }: ExpandableTileDetailProps) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-full')}>
      <dt className="group-label text-xs">{label}</dt>
      <dd className={cn('text-sm', !wide && 'truncate')}>{children}</dd>
    </div>
  );
}

interface TileListHeadingProps {
  title: string;
  count: number;
  className?: string;
  /** An action for the whole list. */
  children?: ReactNode;
}

/** A list of tiles: its name, how many it holds and an optional action. */
export function TileListHeading({ title, count, className, children }: TileListHeadingProps) {
  return (
    <div className={cn('flex items-center justify-between gap-2', children && 'min-h-9', className)}>
      <h3 className="group-label">
        {title}
        <span className="text-faint-foreground ml-3 font-normal">{count}</span>
      </h3>
      {children}
    </div>
  );
}
