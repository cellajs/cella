import { Link, notFound } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';
import { type ComponentProps, type ComponentType, lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '~/modules/common/spinner';
import { type DocPage, getChildDocPages, getDocPage, getDocPageLoader } from '~/modules/page/content';
import { dateShort } from '~/utils/date-short';

interface ViewPageProps {
  slug: string;
}

/** Internal /docs links in content navigate via the router; external links open in a new tab. */
function MdxLink({ href = '', children, ...props }: ComponentProps<'a'>) {
  if (href.startsWith('/')) {
    return (
      <Link to={href} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  );
}

const mdxComponents = { a: MdxLink };

/**
 * Displays a docs page: frontmatter title + compiled MDX body.
 * Supports three render modes:
 * - default: renders full page content
 * - overview: renders intro content + auto-generated child page list
 * - nodeOnly: redirect-like experience showing child page navigation only
 */
function ViewPage({ slug }: ViewPageProps) {
  const page = getDocPage(slug);

  // Lazy-load the code-split MDX body for this slug. The component is keyed by
  // slug at the call site, so this memo lives for exactly one page.
  const Content = useMemo<ComponentType<{ components?: typeof mdxComponents }> | null>(() => {
    const loader = getDocPageLoader(slug);
    return loader ? lazy(async () => ({ default: await loader() })) : null;
  }, [slug]);

  if (!page || !Content) throw notFound();

  const renderMode = page.renderMode;

  return (
    <div className="container">
      <div className="mx-auto max-w-4xl">
        <div className="prose dark:prose-invert max-w-none">
          <h1 className="pt-6">{page.name}</h1>
          {page.updatedAt && <PageUpdatedAt updatedAt={page.updatedAt} />}

          {/* Default mode: render full content */}
          {renderMode === 'default' && (
            <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
              <Content components={mdxComponents} />
            </Suspense>
          )}

          {/* Overview mode: intro content + child page cards */}
          {renderMode === 'overview' && (
            <>
              <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
                <Content components={mdxComponents} />
              </Suspense>
              <ChildPagesList parentSlug={slug} />
            </>
          )}

          {/* Node-only mode: just navigation to children, no content */}
          {renderMode === 'nodeOnly' && <ChildPagesList parentSlug={slug} />}
        </div>
      </div>
    </div>
  );
}

function PageUpdatedAt({ updatedAt }: { updatedAt: string }) {
  const { t } = useTranslation();
  return (
    <p className="text-muted-foreground text-sm lowercase">
      {t('c:last_edited')} {dateShort(updatedAt)}
    </p>
  );
}

/** Auto-generated list of child pages with descriptions. */
function ChildPagesList({ parentSlug }: { parentSlug: string }) {
  const { t } = useTranslation();
  const children = getChildDocPages(parentSlug);

  if (children.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('c:no_child_pages')}</p>;
  }

  return (
    <div className="not-prose mt-6 grid gap-3">
      {children.map((child) => (
        <ChildPageCard key={child.id} page={child} />
      ))}
    </div>
  );
}

/** Card for a child page in overview/nodeOnly mode. */
function ChildPageCard({ page }: { page: DocPage }) {
  return (
    <Link
      to="/docs/page/$"
      params={{ _splat: page.id }}
      className="group flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50"
    >
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-base underline-offset-2 group-hover:underline">{page.name}</h3>
        {page.description && <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">{page.description}</p>}
      </div>
      <ChevronRightIcon
        size={16}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      />
    </Link>
  );
}

export default ViewPage;
