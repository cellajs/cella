import { Link } from '@tanstack/react-router';
import { type ComponentProps, useRef } from 'react';
import { scrollToSectionById, spyPrefix } from '~/hooks/scroll-spy-store';
import { CodeCopyButton } from '~/modules/common/code-copy-button';
import { HashUrlButton } from '~/modules/common/hash-url-button';
import { CodeBlock, CodeBlockActions, CodeBlockContent } from '~/modules/ui/code-block';
import { cn } from '~/utils/cn';
import { isModifiedClick } from '~/utils/is-modified-click';

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
        onClick={(event) => {
          if (isModifiedClick(event)) return;
          event.preventDefault();
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
function MdxHeading({ id = '', className, children, ...props }: ComponentProps<'h2'>) {
  const hash = id.replace(spyPrefix, '');
  return (
    <h2 id={id} className={cn('group/hash-url', className)} {...props}>
      {children}
      {hash && <HashUrlButton className="ms-2" hash={hash} />}
    </h2>
  );
}

/** Tables scroll inside their own container so a wide table never widens the page. */
function MdxTable(props: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  );
}

/** Build-time Shiki `<pre>` (vite.config.ts) in a code block frame; the copy button reads the rendered text. */
function MdxPre(props: ComponentProps<'pre'>) {
  const preRef = useRef<HTMLPreElement>(null);
  return (
    <CodeBlock className="my-5">
      <CodeBlockActions>
        <CodeCopyButton value={() => preRef.current?.textContent ?? ''} />
      </CodeBlockActions>
      <CodeBlockContent ref={preRef} {...props} />
    </CodeBlock>
  );
}

/** MDX overrides for docs bodies, provided via MDXProvider so they apply inside imported repo docs too. */
export const mdxComponents = { a: MdxLink, h2: MdxHeading, pre: MdxPre, table: MdxTable };
