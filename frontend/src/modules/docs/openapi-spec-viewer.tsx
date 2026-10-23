import { useSuspenseQuery } from '@tanstack/react-query';
import { ChevronDownIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, ChevronUpIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { JsonViewer } from '~/modules/common/json-viewer/json-viewer';
import { type JsonPath, matchRowPaths } from '~/modules/common/json-viewer/utils';
import { useMatchSteps } from '~/modules/common/match-highlight';
import { SearchClearButton } from '~/modules/common/search-clear-button';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { JsonActions } from '~/modules/docs/json-actions';
import { openApiSpecQueryOptions, openApiUrl } from '~/modules/docs/query';
import { Button } from '~/modules/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/modules/ui/input-group';
import { cn } from '~/utils/cn';

/** The full OpenAPI spec as JSON, in the viewer's `spec` mode, where a `$ref` scrolls to its target on click. */
export function OpenApiSpecViewer() {
  const { t } = useTranslation();

  const [searchText, setSearchText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [searchMatchPath, setSearchMatchPath] = useState<JsonPath | null>(null);

  const { data } = useSuspenseQuery(openApiSpecQueryOptions);

  const matchPaths = matchRowPaths(data, searchText);
  const steps = useMatchSteps(matchPaths, setSearchMatchPath);

  const handleSearchChange = (newSearch: string) => {
    setSearchText(newSearch);
    setSearchMatchPath(null);
  };

  const isSearching = searchText.length > 0;

  return (
    <>
      <JsonActions
        url={openApiUrl}
        data={data}
        filename="openapi.json"
        resourceName={t('c:docs.openapi_json')}
        className="mb-2 w-full *:flex-1 sm:hidden"
      />

      <div className="sticky top-0 z-10 -mt-2 mb-2 flex items-center gap-2 bg-background/60 py-2 backdrop-blur-xs max-sm:flex-col">
        <InputGroup>
          <InputGroupAddon>
            <SearchSpinner value={searchText} isSearching={false} />
          </InputGroupAddon>
          <InputGroupInput
            type="text"
            placeholder={`${t('c:search')}...`}
            value={searchText}
            onChange={(event) => handleSearchChange(event.target.value)}
          />
          <AnimatePresence mode="wait">
            {isSearching && (
              <motion.div
                key="search-nav"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center overflow-hidden"
              >
                <span className="whitespace-nowrap px-2 text-muted-foreground text-xs">
                  {steps.total === 0 && t('c:no_results')}
                  {steps.total > 0 && (steps.index >= 0 ? t('c:match_position', { current: steps.index + 1, total: steps.total }) : steps.total)}
                </span>
                <span className="sr-only" aria-live="polite">
                  {steps.announcement}
                </span>
                <button
                  type="button"
                  onClick={steps.previous}
                  disabled={steps.total === 0}
                  className="rounded p-1 hover:bg-muted disabled:opacity-30"
                  title={t('c:previous')}
                >
                  <ChevronUpIcon className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={steps.next}
                  disabled={steps.total === 0}
                  className="mr-2 rounded p-1 hover:bg-muted disabled:opacity-30"
                  title={t('c:next')}
                >
                  <ChevronDownIcon className="size-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <InputGroupAddon align="inline-end">
            <SearchClearButton className={cn(!searchText.length && 'invisible')} onClick={() => handleSearchChange('')} />
          </InputGroupAddon>
        </InputGroup>

        <Button
          variant="outline"
          className="max-sm:hidden"
          // The tree's node toggles are named "Expand" too
          aria-label={isExpanded ? undefined : t('c:expand_all')}
          onClick={() => {
            if (isExpanded) {
              // Reset to default state by forcing re-mount
              setResetKey((prev) => prev + 1);
            }
            setIsExpanded((value) => !value);
          }}
        >
          {isExpanded ? <ChevronsDownUpIcon /> : <ChevronsUpDownIcon />}
          <span>{isExpanded ? t('c:reset') : t('c:expand')}</span>
        </Button>

        {/* Desktop-only actions; the mobile copy sits above the sticky bar */}
        <JsonActions url={openApiUrl} data={data} filename="openapi.json" resourceName={t('c:docs.openapi_json')} className="max-sm:hidden" />
      </div>

      <div className="overflow-x-auto rounded-lg bg-muted/30 p-4">
        <JsonViewer
          key={resetKey}
          value={data}
          openapiMode="spec"
          rootName={false}
          enableClipboard
          searchText={searchText}
          showKeyQuotes={false}
          expandAll={isExpanded}
          searchMatchPath={searchMatchPath}
        />
      </div>
    </>
  );
}
