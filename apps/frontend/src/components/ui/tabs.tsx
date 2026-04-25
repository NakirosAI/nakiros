import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils';

/**
 * Root container for a tabbed UI. Thin themed wrapper around Radix `Tabs.Root`
 * laying its children out in a vertical flex column.
 */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col', className)} {...props} />;
}

/**
 * Horizontal tab bar holding {@link TabsTrigger} buttons, separated from the
 * content by a bottom border.
 */
function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex items-center gap-1 border-b border-[var(--line)] text-[var(--text-muted)]',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Clickable tab header rendered inside {@link TabsList}. The active state
 * applies the primary colour via Radix's `data-state="active"` attribute.
 */
function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors',
        'border-b-2 border-transparent -mb-px',
        'hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
        'data-[state=active]:border-[var(--primary)] data-[state=active]:text-[var(--primary)]',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Panel rendered for the currently active tab. Matched to a {@link TabsTrigger}
 * via Radix's shared `value` prop.
 */
function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('mt-4 focus-visible:outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
