import { MDXProvider } from '@mdx-js/react';
import { Link } from '@tanstack/react-router';
import { ChevronRightIcon, ExternalLinkIcon } from 'lucide-react';
import { type ComponentType, lazy, Suspense, useMemo } from 'react';
import { Spinner } from '~/modules/common/spinner';
import { type DocsTile, docsConfig, getDocPageLoader, getResolvedDocPageComponent } from '~/modules/page/content';
import { mdxComponents } from '~/modules/page/mdx-components';

/**
 * The /docs landing page (title + intro MDX + link tiles), driven by the global docs config
 * (content root index.mdx frontmatter) so forks can customize it without touching code.
 */
export function DocsLandingPage() {
  // Body resolved by the index route loader; the lazy path covers other callers and
  // the fallback-config case (no root index.mdx → no body, title + tiles only).
  const Content = useMemo<ComponentType<{ components?: typeof mdxComponents }> | null>(() => {
    const resolved = getResolvedDocPageComponent('');
    if (resolved) return resolved;
    const loader = getDocPageLoader('');
    return loader ? lazy(async () => ({ default: await loader() })) : null;
  }, []);

  return (
    <div className="container">
      <div className="mx-auto max-w-208">
        <div className="prose dark:prose-invert max-w-none">
          <h1 className="pt-6">{docsConfig.title}</h1>
          {Content && (
            <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" />}>
              <MDXProvider components={mdxComponents}>
                <Content />
              </MDXProvider>
            </Suspense>
          )}
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

/** Landing tile (mirrors the child page cards in view-page). Internal targets use the router. */
function DocsTileCard({ tile }: { tile: DocsTile }) {
  const isInternal = tile.to.startsWith('/');
  const cardClass = 'group flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50';
  const TrailingIcon = isInternal ? ChevronRightIcon : ExternalLinkIcon;
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-base underline-offset-2 group-hover:underline">{tile.label}</h3>
        {tile.description && <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">{tile.description}</p>}
      </div>
      <TrailingIcon className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
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
