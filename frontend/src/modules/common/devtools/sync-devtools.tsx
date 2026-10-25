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
      return 'bg-gray-500';
  }
}

function getCategoryColorClass(name: string): string {
  if (name.startsWith('sync.sse')) return 'text-blue-500';
  if (name.startsWith('sync.message')) return 'text-violet-500';
  if (name.startsWith('sync.cache')) return 'text-amber-500';
  if (name.startsWith('sync.seq')) return 'text-pink-500';
  return 'text-gray-500';
}

const emptyClass = tw('p-6 text-center text-slate-500');
const tabClass = tw('cursor-pointer rounded px-2 py-1 text-slate-400');
const statCardClass = tw('mb-2 rounded-md bg-slate-800 p-3');
const statLabelClass = tw('text-2xs text-slate-400 uppercase tracking-wider');
const statValueClass = tw('mt-1 font-semibold text-slate-100 text-xl');

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
        <div key={span.spanId} className="mb-1 flex items-center gap-2 rounded bg-slate-800 px-2 py-1.5">
          <div className={cn('size-2 rounded-full', getStatusColorClass(span.status))} />
          <div className={cn('flex-1 truncate', getCategoryColorClass(span.name))} title={span.name}>
            {span.name.replace('sync.', '')}
          </div>
          <div className="text-slate-400">{formatDuration(span.duration)}</div>
          <div className="text-2xs text-slate-500">{formatTimeAgo(span.startTime)}</div>
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
        <div key={prefix} className="flex justify-between py-1 text-slate-200">
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
          <div className={statLabelClass}>Total Spans</div>
          <div className={statValueClass}>{stats.total}</div>
        </div>
        <div className={statCardClass}>
          <div className={statLabelClass}>Errors</div>
          <div className={cn(statValueClass, stats.errorCount > 0 ? 'text-red-500' : 'text-green-500')}>{stats.errorCount}</div>
        </div>
      </div>

      <div className={statCardClass}>
        <div className={statLabelClass}>Spans by Type</div>
        <PrefixRows values={stats.byPrefix} />
      </div>

      <div className={statCardClass}>
        <div className={statLabelClass}>Avg Duration by Type</div>
        <PrefixRows values={stats.avgDurationMs} format={formatDuration} />
      </div>
    </div>
  );
}

function TimelineView({ spans }: SpansViewProps) {
  const spansWithLatency = spans.filter((span) => 'sync.e2e_latency_ms' in span.attributes);

  if (spansWithLatency.length === 0) {
    return (
      <div className={emptyClass}>
        No end-to-end latency data yet.
        <br />
        <span className="text-2xs">Latency is calculated from CDC timestamp to frontend processing.</span>
      </div>
    );
  }

  const recent = newestFirst(spansWithLatency, 20).map((span) => ({ span, latency: Number(span.attributes['sync.e2e_latency_ms']) || 0 }));
  const maxLatency = Math.max(...recent.map(({ latency }) => latency), 100);
  const avgLatency = recent.reduce((sum, { latency }) => sum + latency, 0) / recent.length;

  return (
    <div>
      <div className={statCardClass}>
        <div className={statLabelClass}>Avg E2E Latency</div>
        <div className={statValueClass}>{formatDuration(avgLatency)}</div>
      </div>

      <div className={statCardClass}>
        <div className={statLabelClass}>Recent Messages (CDC → Frontend)</div>
        <div className="mt-3">
          {recent.map(({ span, latency }) => (
            <div key={span.spanId} className="mb-2">
              <div className="mb-0.5 flex justify-between text-2xs text-slate-400">
                <span>{String(span.attributes['sync.entity_type'] || 'unknown')}</span>
                <span>{formatDuration(latency)}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-xs bg-slate-700">
                <div
                  className={cn('h-full rounded-xs', latency > 500 ? 'bg-red-500' : latency > 200 ? 'bg-amber-500' : 'bg-green-500')}
                  style={{ width: `${(latency / maxLatency) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const tabs = ['spans', 'stats', 'timeline'] as const;

interface SyncDevtoolsProps {
  onClose: () => void;
}

/** Dev-only floating panel for the sync flow: recent spans, their stats and end-to-end latencies. */
export function SyncDevtools({ onClose }: SyncDevtoolsProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('spans');
  const [filter, setFilter] = useState('');
  // Seeded from the buffer, so the first render is not empty before the subscription replays it
  const [spans, setSpans] = useState<SpanData[]>(getSpans);

  useEffect(() => subscribeToSpans(setSpans), []);

  return (
    <div className="fixed right-4 bottom-4 z-[99999] flex max-h-125 w-105 flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 font-mono text-xs shadow-2xl">
      <div className="flex items-center justify-between border-slate-700 border-b bg-slate-800 p-3">
        <div className="font-semibold text-slate-100 text-sm">⚡ Sync Devtools</div>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={cn(tabClass, activeTab === tab && 'bg-slate-700 text-slate-100')}
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
        {activeTab === 'timeline' && <TimelineView spans={spans} />}
      </div>

      <div className="flex gap-2 border-slate-700 border-t p-2">
        <input
          type="text"
          placeholder="Filter spans..."
          className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-200 outline-none"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <button type="button" className="cursor-pointer rounded bg-slate-700 px-3 py-1.5 text-slate-200" onClick={clearSpans}>
          Clear
        </button>
      </div>
    </div>
  );
}
