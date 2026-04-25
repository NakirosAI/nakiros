import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Top-level card surface. Provides a rounded, bordered container with the
 * Nakiros card background, foreground colours and elevated shadow. Compose with
 * {@link CardHeader}, {@link CardTitle}, {@link CardDescription},
 * {@link CardContent} and {@link CardFooter}.
 */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-[var(--shadow-lg)]',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Header slot for {@link Card}. Stacks {@link CardTitle} +
 * {@link CardDescription} with consistent padding.
 */
function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-2 p-6', className)}
      {...props}
    />
  );
}

/**
 * Heading text inside {@link CardHeader}. Renders a `<div>` (not a heading
 * element) styled as a tracked, bold title.
 */
function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('text-2xl font-semibold tracking-tight text-foreground', className)}
      {...props}
    />
  );
}

/**
 * Muted secondary text inside {@link CardHeader}, typically a subtitle.
 */
function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

/**
 * Body slot for {@link Card}. Holds the main content with horizontal padding
 * and bottom padding (no top padding — sits flush below {@link CardHeader}).
 */
function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-6 pb-6', className)} {...props} />;
}

/**
 * Footer slot for {@link Card}. Lays out trailing actions (buttons, links) in a
 * horizontal flex row.
 */
function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-6 pb-6', className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
