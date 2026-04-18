import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  asChild?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[#0D9E9E] text-[#F0F0F0] hover:bg-[#2ECFCF] hover:shadow-lg hover:shadow-[#0D9E9E]/20',
  secondary:
    'border border-[#1A1A1A] bg-[#111111] text-[#F0F0F0] hover:border-[#0D9E9E] hover:bg-[#1A1A1A]',
  ghost:
    'text-[#F0F0F0]/70 hover:text-[#F0F0F0] hover:bg-[#1A1A1A]',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = 'primary', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2ECFCF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080808] disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
});
