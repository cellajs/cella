/**
 * Module declarations for docs content files compiled by @mdx-js/rollup
 * (see vite.config.ts). Each file exports a React component (default) and a
 * `frontmatter` object injected by remark-mdx-frontmatter, validated at
 * runtime in ~/modules/page/content.ts.
 */
declare module '*.mdx' {
  import type { ComponentType } from 'react';
  export const frontmatter: unknown;
  const MDXContent: ComponentType<{ components?: Record<string, ComponentType<unknown>> }>;
  export default MDXContent;
}

declare module '*.md' {
  import type { ComponentType } from 'react';
  export const frontmatter: unknown;
  const MDXContent: ComponentType<{ components?: Record<string, ComponentType<unknown>> }>;
  export default MDXContent;
}
