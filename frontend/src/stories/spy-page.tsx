import type { ReactNode } from 'react';

/** Aside on the left, one screen-high section per id on the right, each with its `spy-` anchor. */
export function SpyPage({ ids, aside }: { ids: string[]; aside: ReactNode }) {
  return (
    <div className="flex">
      <div className="sticky top-0 h-screen w-64 shrink-0">{aside}</div>
      <div className="flex-1">
        {ids.map((id) => (
          <section key={id} className="h-screen">
            <div id={`spy-${id}`} />
            {id}
          </section>
        ))}
        <div className="h-screen" />
      </div>
    </div>
  );
}

/** The aside row a link sits in. */
export const rowOf = (el: HTMLElement) => el.closest<HTMLElement>('[data-spy-link]') as HTMLElement;

/** The active-row bars under `root`. */
export const bars = (root: HTMLElement) => root.querySelectorAll('span.bg-primary.rounded-full');
