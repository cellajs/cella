import { reactRenderer } from '@hono/react-renderer';

export default reactRenderer(({ children, frontmatter, Layout }) => {
  const _title = `${frontmatter?.title} | blog`;
  return (
    <Layout>
      <div className="markdown mt-16 max-w-screen-lg mx-auto">
        <h1>{frontmatter?.title}</h1>
        <img src={frontmatter.image} alt="a" className="w-full" />
        {children}
      </div>
    </Layout>
  );
});
