/**
 * Shared status configuration for file and sync summary displays.
 *
 * This provides consistent labeling, symbols, colors, and descriptions
 * across all sync CLI output (file analysis and summary).
 */
import pc from 'picocolors';

/** Git commit comparison status */
export type GitStatus = 'upToDate' | 'ahead' | 'behind' | 'diverged' | 'unrelated' | 'unknown';

/** Override status from cella.config.ts */
export type OverrideStatus = 'pinned' | 'ignored' | 'none';

/** Display label shown to user (derived from git status + override) */
export type DisplayLabel =
  | 'identical'
  | 'ahead'
  | 'drifted'
  | 'behind'
  | 'diverged'
  | 'locked'
  | 'unrelated'
  | 'unknown';

/** Configuration for a single display status */
export type StatusEntry = {
  symbol: string;
  colorFn: (text: string) => string;
  reason: string;
  action: string;
};

/** Central status configuration with color functions pre-bound. */
export const STATUS_CONFIG: Record<DisplayLabel, StatusEntry> = {
  identical: { symbol: '✓', colorFn: pc.green, reason: 'Fork matches upstream', action: 'no action needed' },
  ahead: { symbol: '↑', colorFn: pc.blue, reason: 'Fork has newer commits', action: 'protected, keeping fork' },
  drifted: { symbol: '⚡', colorFn: pc.red, reason: 'Fork ahead, not protected', action: 'at risk, consider pinning' },
  behind: { symbol: '↓', colorFn: pc.cyan, reason: 'Upstream has newer commits', action: 'will sync from upstream' },
  diverged: { symbol: '⇅', colorFn: pc.cyan, reason: 'Both sides have changes', action: 'will merge from upstream' },
  locked: { symbol: '🔒', colorFn: pc.yellow, reason: 'Both sides changed, pinned', action: 'protected, keeping fork' },
  unrelated: {
    symbol: '⚠',
    colorFn: pc.magenta,
    reason: 'No shared commit history',
    action: 'manual resolution needed',
  },
  unknown: { symbol: '?', colorFn: pc.red, reason: 'Could not determine status', action: 'manual check needed' },
};

/** Derives the display label from git status and override status. */
export function getDisplayLabel(gitStatus: GitStatus, overrideStatus: OverrideStatus): DisplayLabel {
  if (gitStatus === 'upToDate') return 'identical';
  if (gitStatus === 'ahead') return overrideStatus === 'pinned' || overrideStatus === 'ignored' ? 'ahead' : 'drifted';
  if (gitStatus === 'behind') return 'behind';
  if (gitStatus === 'diverged') return overrideStatus === 'pinned' ? 'locked' : 'diverged';
  if (gitStatus === 'unrelated') return 'unrelated';
  return 'unknown';
}

/** Merge strategy reason texts. */
export const STRATEGY_REASONS = {
  ignored: 'Flagged as ignored in settings',
  identical: 'Content identical',
  newFile: 'New file in upstream',
  pinned: 'File is pinned to fork',
  syncing: 'Will sync from upstream',
  unknown: 'Could not determine strategy',
} as const;
