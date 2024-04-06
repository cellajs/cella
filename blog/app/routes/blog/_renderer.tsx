import { reactRenderer } from '@hono/react-renderer';

export default reactRenderer(({ children, frontmatter }) => {
  const _title = `${frontmatter?.title} | blog`;
  return (
    <div className="markdown">
      <h1>{frontmatter?.title}</h1>
      {children}
    </div>
  );
});
