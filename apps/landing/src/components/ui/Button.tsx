import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant — `primary` (teal CTA), `secondary` (outlined), `ghost` (text-only). */
  variant?: Variant;
  /** Reserved for a future Radix-style slot pattern; currently unused. */
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

/**
 * Shared button primitive for the landing page.
 *
 * Wraps a native `<button>` with focus-visible ring styling, three Tailwind
 * variants (`primary` / `secondary` / `ghost`) and `tailwind-merge`-aware
 * className composition via {@link cn}. Forwards refs so it can be used by
 * tooltips/anchors that need DOM access. Independent of the
 * `apps/frontend/src/components/ui/Button` — kept duplicated to keep the
 * landing bundle minimal.
 */
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
