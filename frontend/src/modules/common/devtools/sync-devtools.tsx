/**
 * Sync Devtools Panel
 *
 * A floating panel for debugging the sync flow in development.
 * Shows real-time spans, latencies, and connection state.
 *
 * Only renders when VITE_DEBUG_MODE=true.
 */

import { useEffect, useState } from 'react';
import { isDebugMode } from '~/env';
import { clearSpans, getSpanStats, type SpanData, subscribeToSpans } from '~/lib/tracing';

// ================================
// Types
// ================================

interface SyncDevtoolsState {
  isOpen: boolean;
  activeTab: 'spans' | 'stats' | 'timeline';
  filter: string;
}

// ================================
// Helpers
// ================================

/** Format duration in ms. */
function formatDuration(ms: number | null): string {
  if (ms === null) return '...';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Format timestamp relative to now. */
function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 1000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

/** Get status color. */
function getStatusColor(status: SpanData['status']): string {
  switch (status) {
    case 'ok':
      return '#22c55e';
    case 'error':
      return '#ef4444';
    default:
      return '#6b7280';
  }
}

/** Get span category color. */
function getCategoryColor(name: string): string {
  if (name.startsWith('sync.sse')) return '#3b82f6';
  if (name.startsWith('sync.message')) return '#8b5cf6';
  if (name.startsWith('sync.cache')) return '#f59e0b';
  if (name.startsWith('sync.seq')) return '#ec4899';
  return '#6b7280';
}

// ================================
// Styles (inline for zero deps)
// ================================

const styles = {
  container: {
    position: 'fixed' as const,
    bottom: '16px',
    right: '16px',
    zIndex: 99999,
    fontFamily: 'ui-monospace, monospace',
    fontSize: '12px',
  },
  toggle: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: '#1e293b',
    border: '2px solid #3b82f6',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  panel: {
    width: '420px',
    maxHeight: '500px',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    padding: '12px',
    background: '#1e293b',
    borderBottom: '1px solid #334155',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#f1f5f9',
    fontWeight: 600,
    fontSize: '13px',
  },
  tabs: {
    display: 'flex',
    gap: '4px',
  },
  tab: {
    padding: '4px 8px',
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    borderRadius: '4px',
    fontSize: '11px',
  },
  tabActive: {
    background: '#334155',
    color: '#f1f5f9',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  spanRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '4px',
    marginBottom: '4px',
    background: '#1e293b',
  },
  spanDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  spanName: {
    flex: 1,
    color: '#e2e8f0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  spanDuration: {
    color: '#94a3b8',
    fontSize: '11px',
  },
  spanTime: {
    color: '#64748b',
    fontSize: '10px',
  },
  statCard: {
    background: '#1e293b',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '8px',
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  statValue: {
    color: '#f1f5f9',
    fontSize: '20px',
    fontWeight: 600,
    marginTop: '4px',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
  },
  empty: {
    color: '#64748b',
    textAlign: 'center' as const,
    padding: '24px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    padding: '8px',
    borderTop: '1px solid #334155',
  },
  button: {
    padding: '6px 12px',
    background: '#334155',
    border: 'none',
    borderRadius: '4px',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: '11px',
  },
  filter: {
    flex: 1,
    padding: '6px 8px',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '4px',
    color: '#e2e8f0',
    fontSize: '11px',
    outline: 'none',
  },
};

// ================================
// Components
// ================================

/** Span list view. */
function SpanList({ spans, filter }: { spans: SpanData[]; filter: string }) {
  const filtered = filter ? spans.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase())) : spans;

  if (filtered.length === 0) {
    return <div style={styles.empty}>No spans recorded yet</div>;
  }

  // Show most recent first
  const sorted = [...filtered].reverse().slice(0, 50);

  return (
    <div>
      {sorted.map((span) => (
        <div key={span.spanId} style={styles.spanRow}>
          <div
            style={{
              ...styles.spanDot,
              background: getStatusColor(span.status),
            }}
          />
          <div
            style={{
              ...styles.spanName,
              color: getCategoryColor(span.name),
            }}
            title={span.name}
          >
            {span.name.replace('sync.', '')}
          </div>
          <div style={styles.spanDuration}>{formatDuration(span.duration)}</div>
          <div style={styles.spanTime}>{formatTimeAgo(span.startTime)}</div>
        </div>
      ))}
    </div>
  );
}

/** Statistics view. */
function StatsView({ spans: _spans }: { spans: SpanData[] }) {
  const stats = getSpanStats();

  return (
    <div>
      <div style={styles.statGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Total Spans</div>
          <div style={styles.statValue}>{stats.total}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Errors</div>
          <div style={{ ...styles.statValue, color: stats.errorCount > 0 ? '#ef4444' : '#22c55e' }}>
            {stats.errorCount}
          </div>
        </div>
      </div>

      <div style={styles.statCard}>
        <div style={styles.statLabel}>Spans by Type</div>
        <div style={{ marginTop: '8px' }}>
          {Object.entries(stats.byPrefix).map(([prefix, count]) => (
            <div
              key={prefix}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                color: '#e2e8f0',
              }}
            >
              <span style={{ color: getCategoryColor(prefix) }}>{prefix}</span>
              <span>{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.statCard}>
        <div style={styles.statLabel}>Avg Duration by Type</div>
        <div style={{ marginTop: '8px' }}>
          {Object.entries(stats.avgDurationMs).map(([prefix, avgMs]) => (
            <div
              key={prefix}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                color: '#e2e8f0',
              }}
            >
              <span style={{ color: getCategoryColor(prefix) }}>{prefix}</span>
              <span>{formatDuration(avgMs)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Timeline view showing end-to-end latency. */
function TimelineView({ spans }: { spans: SpanData[] }) {
  // Find spans with e2e latency attribute
  const spansWithLatency = spans.filter((s) => 'sync.e2e_latency_ms' in s.attributes);

  if (spansWithLatency.length === 0) {
    return (
      <div style={styles.empty}>
        No end-to-end latency data yet.
        <br />
        <span style={{ fontSize: '10px', color: '#64748b' }}>
          Latency is calculated from CDC timestamp to frontend processing.
        </span>
      </div>
    );
  }

  // Get last 20, sorted by time
  const recent = [...spansWithLatency].sort((a, b) => b.startTime - a.startTime).slice(0, 20);

  const latencies = recent.map((s) => Number(s.attributes['sync.e2e_latency_ms']) || 0);
  const maxLatency = Math.max(...latencies, 100);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  return (
    <div>
      <div style={styles.statCard}>
        <div style={styles.statLabel}>Avg E2E Latency</div>
        <div style={styles.statValue}>{formatDuration(avgLatency)}</div>
      </div>

      <div style={styles.statCard}>
        <div style={styles.statLabel}>Recent Messages (CDC → Frontend)</div>
        <div style={{ marginTop: '12px' }}>
          {recent.map((span) => {
            const latency = Number(span.attributes['sync.e2e_latency_ms']) || 0;
            const width = (latency / maxLatency) * 100;

            return (
              <div key={span.spanId} style={{ marginBottom: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    color: '#94a3b8',
                    marginBottom: '2px',
                  }}
                >
                  <span>{String(span.attributes['sync.entityType'] || 'unknown')}</span>
                  <span>{formatDuration(latency)}</span>
                </div>
                <div
                  style={{
                    height: '4px',
                    background: '#334155',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${width}%`,
                      height: '100%',
                      background: latency > 500 ? '#ef4444' : latency > 200 ? '#f59e0b' : '#22c55e',
                      borderRadius: '2px',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ================================
// Main Component
// ================================

interface SyncDevtoolsProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Sync Devtools floating panel. Only renders in debug mode. */
export function SyncDevtools({ isOpen, onClose }: SyncDevtoolsProps) {
  // Only render in debug mode
  if (!isDebugMode || !isOpen) return null;

  const [state, setState] = useState<SyncDevtoolsState>({
    isOpen: true,
    activeTab: 'spans',
    filter: '',
  });

  const [spans, setSpans] = useState<SpanData[]>([]);

  // Subscribe to span updates
  useEffect(() => {
    const unsubscribe = subscribeToSpans(setSpans);
    return unsubscribe;
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.title}>⚡ Sync Devtools</div>
          <div style={styles.tabs}>
            {(['spans', 'stats', 'timeline'] as const).map((tab) => (
              <button
                key={tab}
                style={{
                  ...styles.tab,
                  ...(state.activeTab === tab ? styles.tabActive : {}),
                }}
                onClick={() => setState((s) => ({ ...s, activeTab: tab }))}
              >
                {tab}
              </button>
            ))}
            <button style={styles.tab} onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {state.activeTab === 'spans' && <SpanList spans={spans} filter={state.filter} />}
          {state.activeTab === 'stats' && <StatsView spans={spans} />}
          {state.activeTab === 'timeline' && <TimelineView spans={spans} />}
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <input
            type="text"
            placeholder="Filter spans..."
            style={styles.filter}
            value={state.filter}
            onChange={(e) => setState((s) => ({ ...s, filter: e.target.value }))}
          />
          <button style={styles.button} onClick={() => clearSpans()}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
