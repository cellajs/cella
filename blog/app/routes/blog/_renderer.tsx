import { reactRenderer } from '@hono/react-renderer';

export default reactRenderer(({ children, frontmatter, Layout }) => {
  console.log("frontmatter",frontmatter)
  const _title = `${frontmatter?.title} | blog`;
  return (
    <Layout>
    <div className="markdown">
      <h1>{frontmatter?.title}</h1>
      {children}
    </div>
    </Layout>
  );
});
