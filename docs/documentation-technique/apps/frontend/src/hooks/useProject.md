# useProject.tsx

**Path:** `apps/frontend/src/hooks/useProject.tsx`

React context for the active project, the list of open project tabs, and
helpers to switch / open / close them. Inner views consume the context via
`useProject` instead of prop drilling.

## Exports

### `ProjectProvider`

```ts
function ProjectProvider(props: {
  project: Project;
  openProjects: Project[];
  activeProjectId: string;
  allProjects: Project[];
  openProjectTab(id: string): void;
  closeProjectTab(id: string): void;
  children: ReactNode;
}): JSX.Element;
```

Memoizes the context value over its inputs.

### `useProject`

```ts
function useProject(): ProjectContextValue;
```

Reads the project context. Throws if invoked outside `ProjectProvider`.
