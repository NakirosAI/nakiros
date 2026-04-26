import { createContext, useContext, type ReactNode } from 'react';

import type { AgentRun } from '@nakiros/shared';

type NavigateFn = (run: AgentRun) => void;

const AgentRunNavigationContext = createContext<NavigateFn | null>(null);

interface AgentRunNavigationProviderProps {
  navigate: NavigateFn;
  children: ReactNode;
}

/**
 * Provides the App-level "open this run's native screen" implementation to
 * any descendant `RunsCenter`. Centralizes routing logic in App.tsx without
 * prop-drilling the callback through every view.
 */
export function AgentRunNavigationProvider({
  navigate,
  children,
}: AgentRunNavigationProviderProps) {
  return (
    <AgentRunNavigationContext.Provider value={navigate}>
      {children}
    </AgentRunNavigationContext.Provider>
  );
}

/**
 * Consumer hook for descendants. Returns a no-op when no provider is mounted
 * so the same `RunsCenter` component works inside the App shell and inside
 * isolated playgrounds / Storybook setups.
 */
export function useAgentRunNavigation(): NavigateFn {
  return useContext(AgentRunNavigationContext) ?? noop;
}

function noop(): void {
  // intentional
}
