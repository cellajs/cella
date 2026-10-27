import { useEffect, useRef, useState } from 'react';
import { useJsonViewerContext } from '~/modules/common/json-viewer/context';
import { isPathPrefix, type JsonPath } from '~/modules/common/json-viewer/utils';

// The $ref target's key: amber with a 2px ring, held for 70% of the time, then fading out
const refTargetFlash: Keyframe[] = [
  { backgroundColor: 'rgb(251 191 36)', boxShadow: '0 0 0 2px rgb(251 191 36)', borderRadius: '4px' },
  { backgroundColor: 'rgb(251 191 36)', boxShadow: '0 0 0 2px rgb(251 191 36)', borderRadius: '4px', offset: 0.7, easing: 'ease-out' },
  { backgroundColor: 'transparent', boxShadow: 'none', borderRadius: '4px' },
];

/**
 * A node's open state, with the refs of its row and key. Expand all, a followed $ref and the current search match open
 * every node they reach, also one that mounts later; a collapse sticks until one of them changes again. `targetPath` is a
 * new array per navigation, so following the same $ref again opens its path and flashes its target again.
 */
export function useNodeExpansion(path: JsonPath, initiallyExpanded: boolean) {
  const { targetPath, searchMatchPath, expandAll } = useJsonViewerContext();
  const isOnTargetPath = isPathPrefix(path, targetPath);
  const isOnSearchMatchPath = isPathPrefix(path, searchMatchPath);

  const [isExpanded, setIsExpanded] = useState(initiallyExpanded || expandAll || isOnTargetPath || isOnSearchMatchPath);
  const [triggers, setTriggers] = useState({ expandAll, targetPath, searchMatchPath });
  if (triggers.expandAll !== expandAll || triggers.targetPath !== targetPath || triggers.searchMatchPath !== searchMatchPath) {
    setTriggers({ expandAll, targetPath, searchMatchPath });
    const opens =
      (expandAll && !triggers.expandAll) ||
      (isOnTargetPath && targetPath !== triggers.targetPath) ||
      (isOnSearchMatchPath && searchMatchPath !== triggers.searchMatchPath);
    if (opens) setIsExpanded(true);
  }

  const isCurrentMatch = isOnSearchMatchPath && path.length === searchMatchPath?.length;
  const rowRef = useRef<HTMLDivElement>(null);
  // Also runs on mount: a row inside a collapsed node exists only after its ancestors expanded.
  useEffect(() => {
    if (isCurrentMatch) rowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [isCurrentMatch, searchMatchPath]);

  const isRefTarget = isOnTargetPath && path.length === targetPath?.length;
  const keyRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!isRefTarget) return;
    keyRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    keyRef.current?.animate(refTargetFlash, 3000);
  }, [isRefTarget, targetPath]);

  return { isExpanded, setIsExpanded, isCurrentMatch, rowRef, keyRef };
}
