import { authors as AUTHORS } from '@/constans/author';
import { type FC } from 'react';

export default function Top() {
  return (
    <>
      <Posts />
    </>
  );
}

const Posts: FC = () => {
  const blogs = import.meta.glob<{
    frontmatter: { title: string; date: string; published: boolean; description: string; authors: string[]; readingTime: string };
  }>('./blog/*.mdx', { eager: true });
  const entries = Object.entries(blogs).filter(([_, module]) => module.frontmatter.published);

  return (
    <div className="mt-16 max-w-screen-lg mx-auto">
      <h2>At latest news, guides and updates from Cella</h2>
      <ul className="mt-10">
        {entries.map(([id, module]) => {
          const authors = module.frontmatter.authors.map((author) => AUTHORS[author]);
          return (
            <li className="text-lg mt-2 md:mt-1">
              <a href={`${id.replace(/\.mdx$/, '').replace(/\./g, '')}`}>
                <div className="flex justify-between items-center relative">
                  <p className="text-gray-400 text-md font-bold">READING TIME・{module.frontmatter.readingTime}</p>
                  <div className="flex-grow mx-4 border-b border-gray-400" />
                  <div className="flex">
                    {authors.map((author) => {
                      return <img src={author.icon} alt={`author: ${author.name}`} className="rounded-full w-10 h-10 ml-2" />;
                    })}
                  </div>
                </div>
                <h2 className="text-3xl mt-10">{module.frontmatter.title}</h2>
                <div className="mt-5">
                  <img src="/static/web-vitals-guide.png" alt="a" className="w-full" />
                </div>
                <p className="text-md mt-10">{module.frontmatter.description}</p>

                <div className="text-right mt-10">
                  <p className="text-md text-pink-400">read more</p>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
