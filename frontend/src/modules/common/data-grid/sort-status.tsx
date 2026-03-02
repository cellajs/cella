import type { RenderSortIconProps, RenderSortPriorityProps, RenderSortStatusProps } from './types';

export function renderSortStatus({ sortDirection, priority }: RenderSortStatusProps) {
  return (
    <>
      {renderSortIcon({ sortDirection })}
      {renderSortPriority({ priority })}
    </>
  );
}

export function renderSortIcon({ sortDirection }: RenderSortIconProps) {
  if (sortDirection === undefined) return null;

  return (
    <svg viewBox="0 0 12 8" width="12" height="8" className="fill-current" aria-hidden>
      <path d={sortDirection === 'ASC' ? 'M0 8 6 0 12 8' : 'M0 0 6 8 12 0'} style={{ transition: 'd 0.1s' }} />
    </svg>
  );
}

export function renderSortPriority({ priority }: RenderSortPriorityProps) {
  return priority;
}
