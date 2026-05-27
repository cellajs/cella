import { cn } from '~/utils/cn';
import './success-checkmark.css';

interface SuccessCheckmarkProps {
  className?: string;
  size?: number;
}

export function SuccessCheckmark({ className, size = 50 }: SuccessCheckmarkProps) {
  return (
    <div
      className={cn(
        'fade-in zoom-in-0 mx-auto animate-in duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        className="block animate-[checkmark-fill_.4s_ease-in-out_.7s_forwards,checkmark-scale_.3s_ease-in-out_1.2s_both] rounded-full shadow-[inset_0_0_0_#4bb71b] [stroke-miterlimit:10]"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 52 52"
        role="img"
        aria-label="Success"
      >
        <circle
          className="animate-[checkmark-stroke_.6s_cubic-bezier(0.65,0,0.45,1)_.3s_forwards] fill-white stroke-4 stroke-[#4bb71b] [stroke-dasharray:166] [stroke-dashoffset:166] [stroke-miterlimit:10]"
          cx="26"
          cy="26"
          r="25"
          fill="none"
        />
        <path
          className="origin-center animate-[checkmark-stroke_.3s_cubic-bezier(0.65,0,0.45,1)_1.1s_forwards] stroke-4 stroke-[#4bb71b] [stroke-dasharray:48] [stroke-dashoffset:48]"
          fill="none"
          d="M14.1 27.2l7.1 7.2 16.7-16.8"
        />
      </svg>
    </div>
  );
}
