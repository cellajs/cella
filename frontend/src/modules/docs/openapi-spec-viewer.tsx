import { useSuspenseQuery } from '@tanstack/react-query';
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { JsonViewer } from '~/modules/common/json-viewer/json-viewer';
import { type JsonPath, matchRowPaths } from '~/modules/common/json-viewer/utils';
import { useMatchSteps } from '~/modules/common/match-highlight/use-match-steps';
import { SearchField } from '~/modules/common/search-field';
import { JsonActions } from '~/modules/docs/json-actions';
import { openApiSpecQueryOptions, openApiUrl } from '~/modules/docs/query';
import { Button } from '~/modules/ui/button';

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

  return (
    <>
      <JsonActions
        url={openApiUrl}
        data={data}
        filename="openapi.json"
        resourceName={t('c:docs.openapi_json')}
        className="mb-2 w-full *:flex-1 sm:hidden"
      />

      <div className="sticky top-0 z-10 -mt-2 mb-2 flex items-center gap-2 bg-background py-2 max-sm:flex-col">
        <SearchField id="openapi-search" label={t('c:placeholder.search')} value={searchText} onSearch={handleSearchChange} steps={steps} />

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
