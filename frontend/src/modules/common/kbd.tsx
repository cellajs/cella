import { cn } from "~/lib/utils";

export const Kbd = ({className = '', value = ''}) => {
	return (
		<span className={cn('border rounded-sm flex items-center justify-center size-[18px] text-xs text-primary', className)}>
			<kbd>{value}</kbd>
		</span>
	);
};
