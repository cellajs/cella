import { XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { computeSpanStats } from 'shared/tracing';
import { clearSpans, getSpans, type SpanData, subscribeToSpans } from '~/lib/tracing';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

function formatDuration(ms: number | null): string {
  if (ms === null) return '...';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 1000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

const newestFirst = (spans: SpanData[], limit: number) => [...spans].sort((a, b) => b.startTime - a.startTime).slice(0, limit);

function getStatusColorClass(status: SpanData['status']): string {
  switch (status) {
    case 'ok':
      return 'bg-green-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-muted-foreground';
  }
}

function getCategoryColorClass(name: string): string {
  if (name.startsWith('sync.sse')) return 'text-blue-500';
  if (name.startsWith('sync.message')) return 'text-violet-500';
  if (name.startsWith('sync.cache')) return 'text-amber-500';
  if (name.startsWith('sync.seq')) return 'text-pink-500';
  return 'text-muted-foreground';
}

const emptyClass = tw('p-6 text-center text-faint-foreground');
const tabClass = tw('cursor-pointer rounded px-2 py-1 text-muted-foreground hover:text-foreground');
const statCardClass = tw('mb-2 rounded-md bg-card p-3');
const statLabelClass = tw('group-label');
const statValueClass = tw('mt-1 font-semibold text-xl');

interface SpanListProps {
  spans: SpanData[];
  filter: string;
}

function SpanList({ spans, filter }: SpanListProps) {
  const filtered = filter ? spans.filter((span) => span.name.toLowerCase().includes(filter.toLowerCase())) : spans;

  if (filtered.length === 0) {
    return <div className={emptyClass}>No spans recorded yet</div>;
  }

  return (
    <div>
      {newestFirst(filtered, 50).map((span) => (
        <div key={span.spanId} className="mb-1 flex items-center gap-2 rounded bg-card px-2 py-1.5">
          <div className={cn('size-2 rounded-full', getStatusColorClass(span.status))} />
          <div className={cn('flex-1 truncate', getCategoryColorClass(span.name))} title={span.name}>
            {span.name.replace('sync.', '')}
          </div>
          <div className="text-muted-foreground">{formatDuration(span.duration)}</div>
          <div className="text-2xs text-faint-foreground">{formatTimeAgo(span.startTime)}</div>
        </div>
      ))}
    </div>
  );
}

interface PrefixRowsProps {
  values: Record<string, number>;
  format?: (value: number) => string;
}

function PrefixRows({ values, format = String }: PrefixRowsProps) {
  return (
    <div className="mt-2">
      {Object.entries(values).map(([prefix, value]) => (
        <div key={prefix} className="flex justify-between py-1">
          <span className={getCategoryColorClass(prefix)}>{prefix}</span>
          <span>{format(value)}</span>
        </div>
      ))}
    </div>
  );
}

interface SpansViewProps {
  spans: SpanData[];
}

function StatsView({ spans }: SpansViewProps) {
  const stats = computeSpanStats(spans);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <div className={statCardClass}>
          <div className={statLabelClass}>Total spans</div>
          <div className={statValueClass}>{stats.total}</div>
        </div>
        <div className={statCardClass}>
          <div className={statLabelClass}>Errors</div>
          <div className={cn(statValueClass, stats.errorCount > 0 ? 'text-red-500' : 'text-green-500')}>{stats.errorCount}</div>
        </div>
      </div>

      <div className={statCardClass}>
        <div className={statLabelClass}>Spans by type</div>
        <PrefixRows values={stats.byPrefix} />
      </div>

      <div className={statCardClass}>
        <div className={statLabelClass}>Avg duration by type</div>
        <PrefixRows values={stats.avgDurationMs} format={formatDuration} />
      </div>
    </div>
  );
}

const tabs = ['spans', 'stats'] as const;

interface SyncDevtoolsProps {
  onClose: () => void;
}

/** Dev-only floating panel for the sync flow: recent spans and their stats. */
export function SyncDevtools({ onClose }: SyncDevtoolsProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('spans');
  const [filter, setFilter] = useState('');
  // Seeded from the buffer, so the first render is not empty before the subscription replays it
  const [spans, setSpans] = useState<SpanData[]>(getSpans);

  useEffect(() => subscribeToSpans(setSpans), []);

  return (
    // A dark scope: the panel reads the dark tokens over either theme
    <div className="dark fixed right-4 bottom-4 z-[99999] flex max-h-125 w-105 flex-col overflow-hidden rounded-lg border bg-background font-mono text-foreground text-xs shadow-2xl">
      <div className="flex items-center justify-between border-b bg-card p-3">
        <div className="font-semibold text-sm">⚡ Sync devtools</div>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={cn(tabClass, activeTab === tab && 'bg-muted text-foreground')}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
          <button type="button" className={tabClass} onClick={onClose} aria-label={t('c:close')}>
            <XIcon className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {activeTab === 'spans' && <SpanList spans={spans} filter={filter} />}
        {activeTab === 'stats' && <StatsView spans={spans} />}
      </div>

      <div className="flex gap-2 border-t p-2">
        <input
          type="text"
          placeholder="Filter spans..."
          className="flex-1 rounded border bg-card px-2 py-1.5 outline-none placeholder:text-faint-foreground"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <button type="button" className="cursor-pointer rounded bg-muted px-3 py-1.5" onClick={clearSpans}>
          Clear
        </button>
      </div>
    </div>
  );
}
