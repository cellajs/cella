import { cn } from "~/lib/utils";

export const Kbd = ({className = '', value = ''}) => {
	return (
		<span className={cn('max-xs:hidden border rounded-sm flex items-center justify-center size-[18px] text-xs opacity-50y', className)}>
			<kbd>{value}</kbd>
		</span>
	);
};
