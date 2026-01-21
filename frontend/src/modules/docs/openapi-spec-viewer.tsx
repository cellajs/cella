import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, ChevronUpIcon, XCircleIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchSpinner } from '~/modules/common/search-spinner';
import Spinner from '~/modules/common/spinner';
import { JsonActions } from '~/modules/docs/json-actions';
import { JsonViewer } from '~/modules/docs/json-viewer';
import { getPathToNthMatch } from '~/modules/docs/json-viewer/utils';
import { openApiSpecQueryOptions, openApiUrl } from '~/modules/docs/query';
import { Button } from '~/modules/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/modules/ui/input-group';
import { cn } from '~/utils/cn';

/**
 * Recursively counts all search matches in a value (keys and primitive values).
 */
function countSearchMatches(value: unknown, searchText: string): number {
  if (!searchText) return 0;
  const lowerSearch = searchText.toLowerCase();
  let count = 0;

  // Check primitive values
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') {
    if (value.toLowerCase().includes(lowerSearch)) count++;
  } else if (typeof value === 'number') {
    if (String(value).includes(searchText)) count++;
  } else if (typeof value === 'boolean') {
    if (String(value).toLowerCase().includes(lowerSearch)) count++;
  } else if (Array.isArray(value)) {
    // Check arrays
    for (const item of value) {
      count += countSearchMatches(item, searchText);
    }
  } else if (typeof value === 'object') {
    // Check objects (including keys)
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key.toLowerCase().includes(lowerSearch)) count++;
      count += countSearchMatches(val, searchText);
    }
  }

  return count;
}

/**
 * Displays the full OpenAPI specification JSON with collapsible sections.
 * Uses custom json-viewer with 'openapi' mode for $ref click-to-scroll navigation.
 */
function OpenApiSpecViewer() {
  const { t } = useTranslation();

  const [searchText, setSearchText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1); // -1 = no selection
  const [searchMatchPath, setSearchMatchPath] = useState<(string | number)[] | null>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to a specific match index - first expand the path, then scroll
  const scrollToMatch = (index: number) => {
    if (!viewerContainerRef.current || !data) return;

    // First, compute the path to the match and expand nodes along it
    const result = getPathToNthMatch(data, searchText, index);
    if (result) {
      setSearchMatchPath(result.path);
    }

    // Delay scroll to allow nodes to expand first
    setTimeout(() => {
      if (!viewerContainerRef.current) return;

      const matches = viewerContainerRef.current.querySelectorAll('[data-search-match="true"]');
      if (matches.length === 0) return;

      // Remove previous current-match highlight
      const prevCurrent = viewerContainerRef.current.querySelector('.json-current-match');
      if (prevCurrent) prevCurrent.classList.remove('json-current-match');

      const targetMatch = matches[index];
      if (targetMatch) {
        targetMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetMatch.classList.add('json-current-match');
      }
    }, 150);
  };

  // Fetch OpenAPI json
  const { data, isLoading, error } = useQuery(openApiSpecQueryOptions);

  // Count matches whenever search text or data changes
  const matchCount = useMemo(() => {
    if (!data || !searchText) return 0;
    return countSearchMatches(data, searchText);
  }, [data, searchText]);

  // Reset current match index when search changes
  const handleSearchChange = (newSearch: string) => {
    setSearchText(newSearch);
    setCurrentMatchIndex(-1); // Reset to no selection
    setSearchMatchPath(null);
  };

  const handlePrevMatch = () => {
    // If no selection or at first match, go to last match
    const newIndex = currentMatchIndex <= 0 ? matchCount - 1 : currentMatchIndex - 1;
    setCurrentMatchIndex(newIndex);
    scrollToMatch(newIndex);
  };

  const handleNextMatch = () => {
    // If no selection or at last match, go to first match
    const newIndex = currentMatchIndex < 0 || currentMatchIndex >= matchCount - 1 ? 0 : currentMatchIndex + 1;
    setCurrentMatchIndex(newIndex);
    scrollToMatch(newIndex);
  };

  if (isLoading) return <Spinner />;

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="text-destructive">
          {t('error:load_resource', { resource: t('common:docs.openapi_specification').toLowerCase() })}
        </span>
      </div>
    );
  }

  const isSearching = searchText.length > 0;

  return (
    <>
      <div className="sticky -top-6 z-10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 py-2 -mt-2 mb-2 flex items-center gap-2 max-sm:flex-col w-full">
        {/* Search through JSON */}
        <InputGroup className="max-sm:w-full max-sm:order-last">
          <InputGroupAddon>
            <SearchSpinner value={searchText} isSearching={false} />
          </InputGroupAddon>
          <InputGroupInput
            type="text"
            placeholder={`${t('common:search')}...`}
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <AnimatePresence mode="wait">
            {isSearching ? (
              <motion.div
                key="search-nav"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center overflow-hidden"
              >
                <span className="text-xs text-muted-foreground whitespace-nowrap px-2">
                  {matchCount > 0
                    ? currentMatchIndex >= 0
                      ? `${currentMatchIndex + 1}/${matchCount}`
                      : `${matchCount}`
                    : t('common:no_results')}
                </span>
                <button
                  type="button"
                  onClick={handlePrevMatch}
                  disabled={matchCount === 0}
                  className="p-1 hover:bg-muted rounded disabled:opacity-30"
                  title={t('common:previous')}
                >
                  <ChevronUpIcon size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleNextMatch}
                  disabled={matchCount === 0}
                  className="p-1 hover:bg-muted rounded disabled:opacity-30"
                  title={t('common:next')}
                >
                  <ChevronDownIcon size={14} />
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <InputGroupAddon align="inline-end">
            <XCircleIcon
              size={16}
              className={cn('opacity-70 hover:opacity-100 cursor-pointer', searchText.length ? 'visible' : 'invisible')}
              onClick={() => handleSearchChange('')}
            />
          </InputGroupAddon>
        </InputGroup>

        <Button
          variant="outline"
          className="max-sm:hidden gap-2"
          aria-label={isExpanded ? 'Reset to default' : 'Expand all'}
          onClick={() => {
            if (isExpanded) {
              // Reset to default state by forcing re-mount
              setResetKey((k) => k + 1);
            }
            setIsExpanded(!isExpanded);
          }}
        >
          {isExpanded ? <ChevronsDownUpIcon size={16} /> : <ChevronsUpDownIcon size={16} />}
          <span>{isExpanded ? t('common:reset') : t('common:expand')}</span>
        </Button>

        {/* Copy, download and open in new tab */}
        <JsonActions
          url={openApiUrl}
          data={data}
          filename="openapi.json"
          resourceName={t('common:docs.openapi_json')}
          className="max-sm:w-full"
        />
      </div>

      {/* JSON viewer with collapsible nodes and OpenAPI $ref navigation */}
      <div ref={viewerContainerRef} className="rounded-lg bg-muted/30 p-4 overflow-x-auto">
        <JsonViewer
          key={resetKey}
          value={data}
          openapiMode="spec"
          rootName={false}
          displayDataTypes={false}
          enableClipboard
          indentWidth={2}
          searchText={searchText}
          showKeyQuotes={false}
          expandAll={isExpanded}
          currentMatchIndex={currentMatchIndex}
          searchMatchPath={searchMatchPath}
        />
      </div>
    </>
  );
}

export default OpenApiSpecViewer;
