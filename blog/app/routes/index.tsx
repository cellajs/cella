import { type FC } from "react";

export default function Top() {
  return (
    <>
      <Posts />
    </>
  );
}

const Posts: FC = () => {
  const blogs = import.meta.glob<{
    frontmatter: { title: string; date: string; published: boolean };
  }>("./blog/*.mdx", { eager: true });
  const entries = Object.entries(blogs).filter(
    ([_, module]) => module.frontmatter.published,
  );

  return (
    <div className="mt-16">
      <ul className="mt-10">
        {entries.map(([id, module]) => {
          return (
            <li className="text-lg mt-2 md:mt-1">
              <time className="tabular-nums tnum date pr-3">
                {module.frontmatter.date}
              </time>
              <br className="block md:hidden" />
              <a
                className="text-blue-600 underline"
                href={`${id.replace(/\.mdx$/, "").replace(/\./g, "")}`}
              >
                {module.frontmatter.title}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
