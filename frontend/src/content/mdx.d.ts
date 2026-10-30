declare module '*.mdx' {
  import type { ComponentType } from 'react';

  const MDXContent: ComponentType<{ components?: Record<string, ComponentType<unknown>> }>;
  export default MDXContent;
}

declare module '*.md' {
  import type { ComponentType } from 'react';

  const MDXContent: ComponentType<{ components?: Record<string, ComponentType<unknown>> }>;
  export default MDXContent;
}
