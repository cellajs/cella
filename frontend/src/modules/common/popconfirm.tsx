interface Props {
  children: React.ReactNode;
  title: string;
}

export const PopConfirm = ({ children, title }: Props) => {
  return (
    <div className="flex flex-col gap-3 sm:w-max sm:max-w-72 sm:p-3">
      <p className="text-sm max-sm:py-3 max-sm:text-center">{title}</p>
      {children}
    </div>
  );
};
