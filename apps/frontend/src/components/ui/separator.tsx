import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '../../lib/utils';

/**
 * Thin divider built on Radix `Separator` primitive. Defaults to a horizontal,
 * purely decorative line coloured with the theme's `--line` token. Pass
 * `orientation="vertical"` for vertical dividers inside flex rows.
 */
function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'bg-[var(--line)] shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
