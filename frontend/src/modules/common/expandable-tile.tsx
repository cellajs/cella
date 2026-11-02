import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { ChevronDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';
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

interface StatusDotProps {
  tone: TileTone;
  /** Still being worked out: the dot pulses. */
  checking?: boolean;
}

/** A status's dot on its own, beside text that names the status. */
export function StatusDot({ tone, checking }: StatusDotProps) {
  return <span className={cn('size-2 shrink-0 rounded-full', tileTones[tone].dot, checking && 'animate-pulse')} />;
}

interface TileHeadProps {
  /** An icon or image element, sized by the tile. */
  icon: ReactNode;
  /** Names the icon for assistive technology; without it the icon is decorative. */
  iconLabel?: string;
  title: ReactNode;
  /** After the title: badges or a small icon. */
  badges?: ReactNode;
  /** Opens the line under the title, as a dot on the icon and a colored word. */
  status?: { tone: TileTone; label: string };
  /** The line under the title, after the status. */
  meta: ReactNode;
}

function TileHead({ icon, iconLabel, title, badges, status, meta }: TileHeadProps) {
  return (
    <>
      {iconLabel && <span className="sr-only">{iconLabel}</span>}
      <span className="relative shrink-0 [&>img]:size-6 [&>svg]:size-6" aria-hidden="true">
        {icon}
        {status && <span className={cn('absolute -right-0.5 bottom-0.5 size-2.5 rounded-full ring-2 ring-card', tileTones[status.tone].dot)} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-medium text-sm">{title}</span>
          {badges}
        </span>
        <span className="truncate text-muted-foreground text-sm">
          {status && (
            <>
              <span className={cn('font-medium', tileTones[status.tone].text)}>{status.label}</span>
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
  /** The tile's id in its `Accordion`; unique among the tiles there. */
  value: string;
  /** Above the details while the tile is open, such as a secret to copy. */
  lead?: ReactNode;
  /** `ExpandableTileDetail`s, shown while the tile is open. */
  details: ReactNode;
  /** Buttons under the details. */
  actions?: ReactNode;
}

/** A list item as a card that opens to its details and actions. An `Accordion` holds its tiles and keeps one of them open at a time. */
export function ExpandableTile({ value, lead, details, actions, ...head }: ExpandableTileProps) {
  return (
    // The trigger's focus ring draws on the card, so an open tile rings its details too
    <AccordionPrimitive.Item
      value={value}
      render={
        <Card className="gap-0 py-0 focus-ring:has-[>button:focus-visible]:ring-2 focus-ring:has-[>button:focus-visible]:ring-ring focus-ring:has-[>button:focus-visible]:ring-offset-2 focus-ring:has-[>button:focus-visible]:ring-offset-background sm:gap-0 sm:py-0" />
      }
    >
      <AccordionPrimitive.Trigger className="group/expandable-tile flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left focus-visible:outline-hidden">
        <TileHead {...head} />
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-panel-open/expandable-tile:rotate-180" />
      </AccordionPrimitive.Trigger>
      {/* pl-12 lines the panel up with the title: px-3, the size-6 icon and gap-3 */}
      <AccordionContent className="flex flex-col gap-3 pr-3 pb-3 pl-12">
        {lead}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">{details}</dl>
        {actions && <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{actions}</div>}
      </AccordionContent>
    </AccordionPrimitive.Item>
  );
}

interface StatusTileProps extends TileHeadProps {
  /** At the end of the row, such as a remove button. */
  end?: ReactNode;
}

/** The same head as an `ExpandableTile`, for a list item with nothing to open. */
export function StatusTile({ end, ...head }: StatusTileProps) {
  return (
    <Card className="min-h-14 flex-row items-center gap-3 px-3 py-2 sm:gap-3 sm:py-2">
      <TileHead {...head} />
      {end}
    </Card>
  );
}

interface ExpandableTileDetailProps {
  label: string;
  /** Takes the panel's full width, for a value that wraps such as a list of badges. */
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
  /** The heading's level in the page outline; 3 inside a card. */
  level?: 2 | 3 | 4;
  className?: string;
  /** An action for the whole list, at the end of the row. */
  children?: ReactNode;
}

/** A list of tiles: its name, how many it holds and an optional action. */
export function TileListHeading({ title, count, level = 3, className, children }: TileListHeadingProps) {
  const Heading = level === 2 ? 'h2' : level === 4 ? 'h4' : 'h3';

  return (
    <div className={cn('flex items-center justify-between gap-2', children && 'min-h-9', className)}>
      <Heading className="group-label text-xs">
        {title}
        <span className="ml-3 font-normal text-faint-foreground">{count}</span>
      </Heading>
      {children}
    </div>
  );
}
