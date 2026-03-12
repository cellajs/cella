interface Props {
  children: React.ReactNode;
  title: string;
}

export const PopConfirm = ({ children, title }: Props) => {
  return (
    <div className="sm:p-3 flex flex-col gap-3 sm:max-w-72 sm:w-max">
      <p className="font-light max-sm:py-3 max-sm:text-center text-sm">{title}</p>
      {children}
    </div>
  );
};
