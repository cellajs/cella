import { type ReactNode, useEffect, useState } from 'react';
import { computeSpanStats } from 'shared/tracing';
import { clearSpans, getSpans, type SpanData, subscribeToSpans } from '~/lib/tracing';
import { CloseButton } from '~/modules/common/close-button';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

function formatDuration(ms: number): string {
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
  if (status === 'ok') return 'bg-green-500';
  if (status === 'error') return 'bg-red-500';
  return 'bg-muted-foreground';
}

function getCategoryColorClass(name: string): string {
  if (name.startsWith('sync.sse')) return 'text-blue-500';
  if (name.startsWith('sync.message')) return 'text-violet-500';
  if (name.startsWith('sync.cache')) return 'text-amber-500';
  if (name.startsWith('sync.seq')) return 'text-pink-500';
  return 'text-muted-foreground';
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-card mb-2 rounded-md p-3">
      <div className="group-label">{label}</div>
      {children}
    </div>
  );
}

function SpanList({ spans, filter }: { spans: SpanData[]; filter: string }) {
  const filtered = filter ? spans.filter((span) => span.name.toLowerCase().includes(filter.toLowerCase())) : spans;

  if (filtered.length === 0) return <div className="text-faint-foreground p-6 text-center">No spans recorded yet</div>;

  return (
    <div>
      {newestFirst(filtered, 50).map((span) => (
        <div key={span.spanId} className="bg-card mb-1 flex items-center gap-2 rounded px-2 py-1.5">
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

function PrefixRows({ values, format = String }: { values: Record<string, number>; format?: (value: number) => string }) {
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

function StatsView({ spans }: { spans: SpanData[] }) {
  const stats = computeSpanStats(spans);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Total spans">
          <div className="mt-1 text-xl font-semibold">{stats.total}</div>
        </Stat>
        <Stat label="Errors">
          <div className={cn('mt-1 text-xl font-semibold', stats.errorCount > 0 ? 'text-destructive' : 'text-success')}>{stats.errorCount}</div>
        </Stat>
      </div>

      <Stat label="Spans by type">
        <PrefixRows values={stats.byPrefix} />
      </Stat>

      <Stat label="Avg duration by type">
        <PrefixRows values={stats.avgDurationMs} format={formatDuration} />
      </Stat>
    </div>
  );
}

const tabs = ['spans', 'stats'] as const;

/** Dev-only floating panel for the sync flow: recent spans and their stats. */
export function SyncDevtools({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('spans');
  const [filter, setFilter] = useState('');
  // Seeded from the buffer, so the first render is not empty before the subscription replays it
  const [spans, setSpans] = useState<SpanData[]>(getSpans);

  useEffect(() => subscribeToSpans(setSpans), []);

  return (
    // A dark scope: the panel reads the dark tokens over either theme
    <div className="dark bg-background text-foreground fixed right-4 bottom-4 z-[99999] flex max-h-125 w-105 flex-col overflow-hidden rounded-lg border font-mono text-xs shadow-2xl">
      <div className="bg-card flex items-center justify-between border-b p-3">
        <div className="text-sm font-semibold">⚡ Sync devtools</div>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Button
              key={tab}
              variant="ghost"
              size="micro"
              aria-pressed={activeTab === tab}
              className={cn('text-muted-foreground px-2 font-normal', activeTab === tab && 'bg-muted text-foreground')}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </Button>
          ))}
          <CloseButton size="sm" onClick={onClose} />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {activeTab === 'spans' && <SpanList spans={spans} filter={filter} />}
        {activeTab === 'stats' && <StatsView spans={spans} />}
      </div>

      <div className="flex gap-2 border-t p-2">
        <input
          id="sync-devtools-filter"
          type="text"
          placeholder="Filter spans..."
          className="bg-card placeholder:text-faint-foreground flex-1 rounded border px-2 py-1.5 outline-none"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <button type="button" className="bg-muted cursor-pointer rounded px-3 py-1.5" onClick={clearSpans}>
          Clear
        </button>
      </div>
    </div>
  );
}
