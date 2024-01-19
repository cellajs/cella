interface SimpleHeaderProps {
  heading: string;
  text?: string;
  children?: React.ReactNode;
  className?: string;
}

export function SimpleHeader({ heading, text, children, className = '' }: SimpleHeaderProps) {
  return (
    <div className={`container flex h-auto flex-col justify-between pt-4 md:pt-8 ${className}`}>
      <div className="grid gap-1">
        <h1 className="font-heading text-lg sm:text-xl md:text-2xl">{heading}</h1>
        {text && <p className="text-muted-foreground font-light text-sm sm:text-base">{text}</p>}
      </div>
      {children}
    </div>
  );
}
