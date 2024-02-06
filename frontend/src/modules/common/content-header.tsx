export interface ContentHeaderProps {
  heading: string;
  text?: string;
  children?: React.ReactNode;
}

export function ContentHeader({ heading, text, children }: ContentHeaderProps) {
  return (
    <div className="container flex h-auto max-w-none flex-col justify-between border-b py-4">
      <div className="grid gap-1">
        <h1 className="font-heading text-3xl md:text-4xl">{heading}</h1>
        {text && <p className="text-muted-foreground text-lg">{text}</p>}
      </div>
      {children}
    </div>
  );
}
