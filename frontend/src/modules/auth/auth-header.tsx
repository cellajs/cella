import type { ReactNode } from 'react';

interface AuthHeaderProps {
  title: string;
  image?: ReactNode;
  children?: ReactNode;
}

/** The title block of every auth page and step, with the page's one heading. */
export function AuthHeader({ title, image, children }: AuthHeaderProps) {
  return (
    <header className="flex flex-col items-center gap-3 text-center">
      {image}
      <h1 className="text-2xl">{title}</h1>
      {children}
    </header>
  );
}
