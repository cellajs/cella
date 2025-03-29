interface Props {
  children: React.ReactNode;
  title: string;
}

export const PopConfirm = ({ children, title }: Props) => {
  return (
    <div className="sm:px-1 sm:py-2 flex flex-col gap-3 sm:max-w-56 sm:w-max sm:scale-90">
      <p className="font-light text-sm">{title}</p>
      {children}
    </div>
  );
};
