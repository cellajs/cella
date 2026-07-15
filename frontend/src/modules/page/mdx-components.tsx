import { Link } from '@tanstack/react-router';
import type { ComponentProps } from 'react';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { HashUrlButton } from '~/modules/common/hash-url-button';
import { getHashUrl } from '~/modules/docs/hash-url';
import { CodeBlock } from '~/modules/page/code-block';

/**
 * Shared MDX component overrides for docs content bodies (view page and docs landing).
 * Provided via MDXProvider so they also apply inside imported repo docs.
 */

/**
 * Internal /docs links navigate via the router; in-page #anchor links scroll via the spy store
 * (which queues until lazy content is laid out); external links open in a new tab.
 */
function MdxLink({ href = '', children, ...props }: ComponentProps<'a'>) {
  if (href.startsWith('/')) {
    return (
      <Link to={href} {...props}>
        {children}
      </Link>
    );
  }
  if (href.startsWith('#')) {
    return (
      <a
        href={href}
        {...props}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          scrollToSectionById(decodeURIComponent(href.slice(1)));
        }}
      >
        {children}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  );
}

/**
 * Section heading (h2) with a hover copy-link button; the copied URL uses the bare hash slug while
 * the DOM id keeps its `spy-` prefix (spy store convention). Deeper headings keep anchor ids but
 * render plain (the button sits awkwardly at h3 size).
 */
function MdxHeading({ id = '', children, ...props }: ComponentProps<'h2'>) {
  const hash = id.replace(/^spy-/, '');
  return (
    <h2 id={id} className="group" {...props}>
      {children}
      {/* ms-2: inline in heading text, unlike the flex-gap card titles elsewhere */}
      {hash && <HashUrlButton className="ms-2" url={getHashUrl(hash)} />}
    </h2>
  );
}

export const mdxComponents = {
  a: MdxLink,
  h2: MdxHeading,
  pre: CodeBlock,
};
