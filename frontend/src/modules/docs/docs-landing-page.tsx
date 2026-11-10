import { MDXProvider } from '@mdx-js/react';
import { Link } from '@tanstack/react-router';
import { ChevronRightIcon, ExternalLinkIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { Spinner } from '~/modules/common/spinner';
import { type DocsTile, docsConfig, getDocPageComponent } from '~/modules/page/content';
import { mdxComponents } from '~/modules/page/mdx-components';
import { tw } from '~/utils/tw';

/** The /docs landing page, driven by the global docs config (content root index.mdx frontmatter). */
export function DocsLandingPage() {
  const { t } = useTranslation();
  const Content = getDocPageComponent('');
  const sourceUrl = appConfig.repositoryUrl;

  return (
    <div className="container">
      <div className="mx-auto max-w-208">
        <div className="prose dark:prose-invert max-w-none">
          <h1 className="pt-6">{docsConfig.title}</h1>
          {Content && (
            <Suspense fallback={<Spinner className="my-16" />}>
              <MDXProvider components={mdxComponents}>
                <Content />
              </MDXProvider>
            </Suspense>
          )}
          <p className="not-prose text-muted-foreground text-sm">
            {sourceUrl ? (
              <a href={sourceUrl} target="_blank" rel="noreferrer" title={t('c:source_code')} className="link-inline">
                v{__PKG_VERSION__}
              </a>
            ) : (
              `v${__PKG_VERSION__}`
            )}
          </p>
          {docsConfig.tiles.length > 0 && (
            <div className="not-prose mt-8 grid gap-3 sm:grid-cols-2">
              {docsConfig.tiles.map((tile) => (
                <DocsTileCard key={`${tile.to}-${tile.label}`} tile={tile} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const cardClass = tw('group/docs-tile border-input hover:bg-hover flex items-start gap-3 rounded-lg border p-4 transition-colors');

/** A docs tile: the landing tiles and a page's child pages; internal targets go through the router. */
export function DocsTileCard({ tile }: { tile: DocsTile }) {
  const isInternal = tile.to.startsWith('/');
  const TrailingIcon = isInternal ? ChevronRightIcon : ExternalLinkIcon;
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <h3 className="link-decoration group-active/docs-tile:link-decoration-strong text-base font-medium group-hover/docs-tile:underline">
          {tile.label}
        </h3>
        {tile.description && <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{tile.description}</p>}
      </div>
      <TrailingIcon className="text-muted-foreground mt-1 shrink-0 opacity-0 transition-opacity group-hover/docs-tile:opacity-100" />
    </>
  );

  if (isInternal) {
    return (
      <Link to={tile.to} draggable={false} className={cardClass}>
        {inner}
      </Link>
    );
  }
  return (
    <a href={tile.to} target="_blank" rel="noreferrer" draggable={false} className={cardClass}>
      {inner}
    </a>
  );
}
