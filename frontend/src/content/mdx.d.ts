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
