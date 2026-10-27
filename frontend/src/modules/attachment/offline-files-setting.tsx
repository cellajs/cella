import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import dayjs from 'dayjs';
import { TriangleAlertIcon } from 'lucide-react';
import { type PointerEvent, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  defaultOfflineFilesTier,
  type OfflineFilesTier,
  offlineFilesRules,
  offlineFilesTiers,
  useOfflineFilesStore,
} from '~/modules/attachment/offline/offline-files-store';
import { percentFull, useOfflineFootprint } from '~/modules/attachment/offline/use-offline-footprint';
import { NamedText } from '~/modules/common/named-text';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { formatBytes } from '~/utils/format-bytes';

const tierText = {
  off: { label: 'c:offline_files.off', text: 'c:offline_files.off.text' },
  previews: { label: 'c:offline_files.previews', text: 'c:offline_files.previews.text' },
  recent: { label: 'c:offline_files.recent', text: 'c:offline_files.recent.text' },
  all: { label: 'c:offline_files.all', text: 'c:offline_files.all.text' },
} as const satisfies Record<OfflineFilesTier, { label: string; text: string }>;

const lastIndex = offlineFilesTiers.length - 1;
const budgets = offlineFilesTiers.map((tier) => offlineFilesRules(tier).budget);

/** A slight overshoot, so the thumb and the caret settle on a stop. */
const snapEase = 'ease-[cubic-bezier(0.34,1.3,0.64,1)]';

const stopPercent = (index: number) => (index / lastIndex) * 100;

/** Where a byte count sits on the track: each stop at its tier's budget, linear in between. */
function trackPercent(bytes: number) {
  for (let index = 1; index <= lastIndex; index++) {
    if (bytes > budgets[index]) continue;
    const span = budgets[index] - budgets[index - 1];
    return stopPercent(index - 1 + (span > 0 ? Math.max(0, bytes - budgets[index - 1]) / span : 1));
  }
  return 100;
}

/**
 * The offline files tier of this device. The track draws what is stored against each tier's budget. At rest the balloon
 * below says how full the tier is; while the slider is hovered, dragged or focused, it explains the stop it points at. A
 * tier that removes stored files waits for a confirmation, any other applies at once.
 */
export function OfflineFilesSetting() {
  const { t } = useTranslation();
  const descriptionId = useId();
  const confirmId = useId();
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const tier = useOfflineFilesStore((state) => state.tier) ?? defaultOfflineFilesTier();
  const setTier = useOfflineFilesStore((state) => state.setTier);
  const footprint = useOfflineFootprint();
  const [dragged, setDragged] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  // The confirmation keeps its amount while it fades out
  const [askedBytes, setAskedBytes] = useState(0);

  const current = offlineFilesTiers.indexOf(tier);
  const explored = dragged ?? pending ?? hovered ?? current;
  const stored = footprint?.bytes ?? 0;
  const droppedBy = (index: number) => footprint?.dropped[index] ?? 0;
  const keptPercent = trackPercent(stored - droppedBy(explored));
  const asked = pending === null ? askedBytes : droppedBy(pending);
  // Shown once the thumb rests on the tier it asks about; a drag explains the tiers it passes
  const confirming = pending !== null && dragged === null;
  // Off has no budget to fill, so its own explanation stays
  const showStatus = dragged === null && pending === null && hovered === null && !keyboardFocus && budgets[current] > 0;
  const showsTier = (index: number) => !showStatus && !confirming && index === explored;

  const apply = (index: number) => {
    const next = offlineFilesTiers[index];
    setTier(next);
    // Asked when the user chooses to keep files: without it the browser may clear them under storage pressure.
    if (offlineFilesRules(next).files) void navigator.storage?.persist?.();
  };

  const choose = (index: number) => {
    setDragged(null);
    const asks = index !== current && droppedBy(index) > 0;
    setPending(asks ? index : null);
    if (asks) setAskedBytes(droppedBy(index));
    else if (index !== current) apply(index);
  };

  // Focus returns to the thumb: the confirmation turns inert under a focused button
  const cancel = () => {
    setPending(null);
    thumbInputRef.current?.focus();
  };

  const confirm = () => {
    if (pending === null) return;
    apply(pending);
    cancel();
  };

  const hover = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.buttons) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setHovered(Math.round(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * lastIndex));
  };

  const valueText = (index: number) => {
    const label = t(tierText[offlineFilesTiers[index]].label);
    if (!budgets[index]) return label;
    return `${label}. ${t('c:offline_files.usage', { used: formatBytes(stored), budget: formatBytes(budgets[index]) })}`;
  };

  // A panel per tier stays mounted, so the one leaving fades out while the next slides in from the side of travel
  const panelClass = (index: number, active: boolean) =>
    cn(
      'col-start-1 row-start-1 transition-[opacity,translate] duration-300 ease-out motion-reduce:transition-none',
      active ? 'opacity-100' : 'pointer-events-none opacity-0',
      !active && (index < explored ? '-translate-x-3' : 'translate-x-3'),
    );

  return (
    <div>
      <SliderPrimitive.Root
        value={dragged ?? pending ?? current}
        min={0}
        max={lastIndex}
        step={1}
        onValueChange={(value) => {
          setDragged(value);
          setHovered(null);
          // An open confirmation follows the thumb among tiers that remove files and closes on one that removes none
          if (value === current || droppedBy(value) === 0) setPending(null);
        }}
        onValueCommitted={choose}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && pending !== null) cancel();
        }}
        onFocus={(event) => setKeyboardFocus(event.target.matches(':focus-visible'))}
        onBlur={() => setKeyboardFocus(false)}
        className="group/slider touch-none select-none [--tick-cut:var(--background)]"
      >
        <SliderPrimitive.Control
          onPointerMove={hover}
          onPointerLeave={() => setHovered(null)}
          className="relative flex w-full cursor-pointer flex-col gap-2 pb-1"
        >
          {/* Each label sits over its stop, the outer two at the track's ends; text-xs fits all four in one row at phone width */}
          <div className="relative h-9 text-sm max-sm:text-xs" aria-hidden="true">
            {offlineFilesTiers.map((value, index) => (
              <span
                key={value}
                className={cn(
                  'absolute top-0 flex -translate-x-1/2 flex-col items-center whitespace-nowrap text-muted-foreground transition-colors first:translate-x-0 first:items-start last:-translate-x-full last:items-end',
                  (index === explored || index === current) && 'text-foreground',
                  index === current && 'font-medium',
                )}
                style={{ left: `${stopPercent(index)}%` }}
              >
                {t(tierText[value].label)}
                {budgets[index] > 0 && <span className="font-normal text-muted-foreground text-xs">{formatBytes(budgets[index])}</span>}
              </span>
            ))}
          </div>
          <SliderPrimitive.Track className="relative h-2 w-full">
            {/* h-full: the indicator inherits its height, and an inset box computes to auto */}
            <div className="absolute inset-0 h-full overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 bg-primary/10 transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${stopPercent(explored)}%` }}
              />
              <SliderPrimitive.Indicator
                className={cn(
                  'absolute inset-y-0 bg-primary/20 transition-[width] duration-400 group-data-dragging/slider:duration-150 motion-reduce:transition-none',
                  snapEase,
                )}
              />
              <div
                className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${keptPercent}%`, minWidth: stored - droppedBy(explored) > 0 ? 3 : 0 }}
              />
              <div
                className="absolute inset-y-0 transition-[left,width] duration-500 ease-out [background:repeating-linear-gradient(135deg,var(--destructive)_0_3px,color-mix(in_oklab,var(--destructive)_25%,transparent)_3px_6px)] motion-reduce:transition-none"
                style={{ left: `${keptPercent}%`, width: `${trackPercent(stored) - keptPercent}%`, minWidth: droppedBy(explored) > 0 ? 3 : 0 }}
              />
            </div>
            {/* A notch per stop: a cut through the bar in the surface color, with a short mark above and below */}
            {offlineFilesTiers.map((value, index) => (
              <span
                key={value}
                aria-hidden="true"
                className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 [background:linear-gradient(var(--border)_0_4px,var(--tick-cut)_4px_12px,var(--border)_12px)]"
                style={{ left: `${stopPercent(index)}%` }}
              />
            ))}
            <SliderPrimitive.Thumb
              inputRef={thumbInputRef}
              aria-label={t('c:offline_files')}
              aria-describedby={confirming ? confirmId : descriptionId}
              getAriaValueText={(_, value) => valueText(value)}
              className={cn(
                'focus-within-effect z-10 block h-5 w-2.5 rounded-full border border-primary bg-white shadow-sm transition-[inset-inline-start,background-color,border-color] duration-400 hover:ring-4 hover:ring-ring/30 has-focus-visible:ring-offset-(--tick-cut) data-dragging:duration-150 motion-reduce:transition-none',
                snapEase,
                pending !== null && 'border-destructive bg-card',
              )}
            />
          </SliderPrimitive.Track>
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>

      <div className={cn('relative mt-4 rounded-lg border bg-background p-4 transition-colors', pending !== null && 'border-destructive/50')}>
        <span
          aria-hidden="true"
          className={cn(
            'absolute -top-1.75 size-3 -translate-x-1/2 rotate-45 rounded-tl-[3px] border-t border-l bg-background transition-[left,border-color] duration-300 motion-reduce:transition-none',
            snapEase,
            pending !== null && 'border-destructive/50',
          )}
          style={{ left: `clamp(1rem, ${stopPercent(explored)}%, calc(100% - 1rem))` }}
        />
        {/* Every state stacks in one cell, so the balloon keeps the height of the tallest and the dialog never resizes */}
        <div className="grid text-sm">
          <p
            id={showStatus ? descriptionId : undefined}
            aria-hidden={!showStatus}
            className={cn(
              'col-start-1 row-start-1 transition-opacity duration-300 ease-out motion-reduce:transition-none',
              !showStatus && 'pointer-events-none opacity-0',
            )}
          >
            {t('c:offline_files.status', {
              percent: percentFull(stored, budgets[current]),
              used: formatBytes(stored),
              budget: formatBytes(budgets[current]),
            })}
            {footprint?.lastStoredAt && ` ${t('c:offline_files.last_saved', { time: dayjs(footprint.lastStoredAt).fromNow() })}`}
          </p>
          {offlineFilesTiers.map((value, index) => (
            <p
              key={value}
              id={showsTier(index) ? descriptionId : undefined}
              aria-hidden={!showsTier(index)}
              className={panelClass(index, showsTier(index))}
            >
              {t(tierText[value].text, { budget: formatBytes(budgets[index]) })}
            </p>
          ))}
          <div
            inert={!confirming}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancel();
            }}
            className={cn(
              'col-start-1 row-start-1 flex flex-wrap items-center gap-x-3 gap-y-2 transition-opacity duration-300 ease-out motion-reduce:transition-none',
              !confirming && 'pointer-events-none opacity-0',
            )}
          >
            <p className="flex min-w-48 flex-1 gap-2" aria-hidden="true">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                <NamedText i18nKey="c:confirm.remove_offline_files" name={formatBytes(asked)} />
              </span>
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={cancel}>
                {t('c:cancel')}
              </Button>
              <Button size="sm" variant="destructive" onClick={confirm}>
                {t('c:remove_resource', { resource: formatBytes(asked) })}
              </Button>
            </div>
          </div>
        </div>
        {/* Mounted and empty until a confirmation, so each one is announced */}
        <p id={confirmId} role="status" className="sr-only">
          {confirming && <NamedText i18nKey="c:confirm.remove_offline_files" name={formatBytes(asked)} />}
        </p>
      </div>
    </div>
  );
}
