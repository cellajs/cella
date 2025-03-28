interface Props {
  children: React.ReactNode;
  title: string;
}

export const PopConfirm = ({ children, title }: Props) => {
  return (
    <div className="px-1 py-2 flex flex-col gap-3 max-w-56 w-max scale-90">
      <p className="font-light text-sm">{title}</p>
      {children}
    </div>
  );
};
