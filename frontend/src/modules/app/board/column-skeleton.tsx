import useMounted from '~/hooks/use-mounted';
import { Skeleton } from '~/modules/ui/skeleton';

interface Props {
  rowCount?: number;
  rowHeight?: number;
  columnCount?: number;
}

export const ColumnSkeleton = ({ rowHeight = 88, rowCount = 8 }: Props) => {
  const renderRowHeight = rowHeight - 8;
  const { hasStarted } = useMounted();
  return (
    <div className={`w-full overflow-auto flex flex-col transition-opacity duration-300 ${hasStarted ? 'opacity-100' : 'opacity-0'}`}>
      <div className="flex justify-start w-full h-9 rounded-none gap-1 border-b border-b-green-500/10 border-t border-t-transparent ring-inset bg-green-500/5 -mt-[.07rem]" />
      {Array.from({ length: rowCount }).map((_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton is not undergoing mutations
        <div key={index} className="hover:bg-transparent px-1 py-2 border-b">
          <Skeleton className={'w-full rounded'} style={{ height: `${renderRowHeight}px` }} />
        </div>
      ))}
      <div className="flex justify-start h-9 w-full rounded-none gap-1 ring-inset bg-sky-500/5" />
    </div>
  );
};
