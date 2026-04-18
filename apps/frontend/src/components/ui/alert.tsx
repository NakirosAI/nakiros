import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm [&_svg]:absolute [&_svg]:left-4 [&_svg]:top-4 [&_svg+div]:translate-y-[-2px] [&_svg~*]:pl-7',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        destructive:
          'border-destructive/40 bg-destructive/10 text-destructive [&_svg]:text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('mb-1 font-medium leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('text-sm text-inherit [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
