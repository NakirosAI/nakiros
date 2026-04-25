# Onboarding.tsx

**Path:** `apps/frontend/src/views/Onboarding.tsx`

Four-step first-launch onboarding shown by `App.tsx` when no preferences file exists yet: welcome → editor detection → install Claude Code hooks → done. Calls `window.nakiros.onboardingDetectEditors` to discover supported editors, then `onboardingInstall` to wire up Nakiros hooks for the chosen editors, streaming progress over `onOnboardingProgress` (consumed via `useIpcListener`). On completion, hands control back to the app via `onDone`.

## Exports

### `default` — `Onboarding`

```ts
export default function Onboarding(props: OnboardingProps): JSX.Element
```

Renders the four-step wizard with an animated canvas logo, editor list, install progress feed, and final confirmation. Props: `{ onDone: () => void }`.
