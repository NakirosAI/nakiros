---
name: API correcte Milkdown Crepe — listener
description: crepe.on() reçoit un ListenerManager, pas un wrapper — appeler api.markdownUpdated() directement
type: feedback
---

`crepe.on((api) => { ... })` — `api` est un `ListenerManager`.

Bonne syntaxe :
```ts
crepe.on((api) => {
  api.markdownUpdated((_ctx, markdown) => { ... });
});
```

Mauvaise syntaxe (erreur TS2551) :
```ts
api.listener.markdownUpdated(...)  // 'listener' n'existe pas, c'est 'listeners' (getter read-only)
```

**Why:** Confusion entre la propriété `.listeners` (Subscribers, lecture seule) et les méthodes `.markdownUpdated()` (subscribe, fluent).

**How to apply:** Toujours appeler les méthodes directement sur api dans le callback de `crepe.on`.
