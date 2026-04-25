import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '../../lib/utils';

/**
 * Horizontal progress bar built on Radix `Progress` primitive. The indicator
 * is translated by `100 - value` percent to fill from the left as `value`
 * grows from 0 to 100.
 */
function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-[var(--bg-muted)]', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-[var(--primary)] transition-all"
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
