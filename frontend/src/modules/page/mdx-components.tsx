import { Link } from '@tanstack/react-router';
import type { ComponentProps } from 'react';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { HashUrlButton } from '~/modules/common/hash-url-button';
import { getHashUrl } from '~/modules/docs/hash-url';
import { CodeBlock } from '~/modules/page/code-block';

/** Internal /docs links route; `#` anchors scroll via the spy store, which queues until lazy content is laid out; external links open a new tab. */
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

/** h2 with a hover copy-link button: the copied URL uses the bare hash slug while the DOM id keeps its `spy-` prefix. */
function MdxHeading({ id = '', children, ...props }: ComponentProps<'h2'>) {
  const hash = id.replace(/^spy-/, '');
  return (
    <h2 id={id} className="group" {...props}>
      {children}
      {hash && <HashUrlButton className="ms-2" url={getHashUrl(hash)} />}
    </h2>
  );
}

/** MDX overrides for docs bodies, provided via MDXProvider so they apply inside imported repo docs too. */
export const mdxComponents = {
  a: MdxLink,
  h2: MdxHeading,
  pre: CodeBlock,
};
