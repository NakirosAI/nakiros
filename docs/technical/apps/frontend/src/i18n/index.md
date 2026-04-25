# index.ts

**Path:** `apps/frontend/src/i18n/index.ts`

i18next bootstrap. Statically imports every FR/EN namespace JSON, asks
the daemon for the system language, then initialises i18next once. The
app waits on `i18nReady` before rendering so the first paint is already
translated.

## Exports

### `i18nReady`

```ts
const i18nReady: Promise<void>;
```

Resolves once `i18next.init` has completed. `await` this in `main.tsx`
before rendering React.

### `default` (`i18n`)

```ts
import i18n from './i18n';
```

The singleton i18next instance. Use only for imperative APIs such as
`i18n.changeLanguage` — components should call
`useTranslation(namespace)` instead.
