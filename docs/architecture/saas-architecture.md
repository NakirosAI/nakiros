# Architecture SaaS Nakiros

## Trois surfaces

| Surface | Stack | Déployé sur |
|---------|-------|-------------|
| **nakiros.com** | Next.js + `@clerk/nextjs` | Cloudflare Pages |
| **Desktop** | Electron + React | DMG / AppImage |
| **API Worker** | Cloudflare Worker | api.nakiros.com |

---

## Auth — Clerk + PKCE

Le Desktop réalise le flow OAuth2 PKCE **directement avec Clerk**, sans passer par le Worker.

### Flow complet

```
Desktop                  Navigateur               Clerk              Worker
   |                         |                       |                  |
   |── génère code_verifier ─▶                        |                  |
   |── code_challenge = sha256(verifier) ─────────────▶                  |
   |── shell.openExternal(authorize_url) ─▶            |                  |
   |                         |── GET /oauth/authorize ▶|                  |
   |                         |                       |── sign-in UI ─────▶|
   |                         |◀── nakiros://auth/callback?code=xxx ───────|
   |◀── open-url event ──────|                        |                  |
   |── POST /oauth/token (code + code_verifier) ────▶  |                  |
   |◀── { access_token: Clerk JWT } ─────────────────  |                  |
   |── storeAuth(access_token) → safeStorage           |                  |
   |── GET /ws (Authorization: Bearer <jwt>) ──────────────────────────▶ |
   |◀── [ ...workspaces ] ──────────────────────────────────────────────  |
```

### Variables d'environnement Desktop

```
NAKIROS_CLERK_DOMAIN    = accounts.nakiros.com   (ou variable d'env)
NAKIROS_CLERK_CLIENT_ID = nakiros_desktop         (OAuth app créée dans Clerk)
NAKIROS_API_URL         = https://api.nakiros.com
```

### Vérification JWT côté Worker

```typescript
const payload = await clerk.verifyToken(bearerToken);
// payload.sub       = userId
// payload.org_id    = orgId (si user dans une org)
// payload.org_role  = 'org:admin' | 'org:member'
```

Pas de table `api_tokens` dans D1 — le JWT Clerk est la source de vérité.

---

## Multi-tenancy — Organisations Clerk

| Concept Nakiros | Clerk |
|-----------------|-------|
| Compte solo | Clerk User |
| Organisation / Équipe | Clerk Organization |
| Workspace partagé | `ownerId = org_id` |
| Workspace solo | `ownerId = user_id` |

### Isolation des workspaces

```typescript
function canAccess(workspace: StoredWorkspace, auth: AuthContext): boolean {
  if (!workspace.ownerId) return true; // migration: pas encore d'owner
  return workspace.ownerId === auth.orgId || workspace.ownerId === auth.userId;
}
```

Invitations et rôles gérés entièrement via Clerk Organizations.

---

## Pricing (Stripe — implémenté plus tard)

| Plan | Workspaces | Prix |
|------|-----------|------|
| Solo | 1 | Gratuit |
| Pro | Illimité | 20 €/mois |
| Enterprise | Illimité | Par siège |

Les limites seront stockées dans les métadonnées Clerk (user ou org), vérifiées par le Worker.
Stripe envoie des webhooks → Worker → met à jour les métadonnées Clerk.

---

## API Worker — Endpoints

### Publics (sans auth)

```
GET  /status          → health check
```

### Protégés (Authorization: Bearer <clerk_jwt>)

```
GET  /ws                          → workspaces de l'utilisateur/org
PUT  /ws/:id                      → créer/mettre à jour un workspace
DEL  /ws/:id                      → supprimer
PUT  /ws/:id/context              → mettre à jour context global/product/interRepo
PUT  /ws/:id/repos/:name/context  → mettre à jour context d'un repo
GET  /ws/:id/collabs              → sessions de collaboration
GET  /ws/:id/collabs/:collabId    → détail d'une session
POST /ws/:id/mcp                  → MCP Server (agents IA)
```

> Les anciens endpoints `/auth/*` du Worker sont supprimés.
> Le Desktop fait le PKCE directement avec Clerk.

---

## Infrastructure Cloudflare

```
api.nakiros.com      → Worker (packages/worker)
nakiros.com          → Pages (apps/website)
D1: nakiros-api      → workspaces + collab_sessions
```

---

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `packages/worker/src/auth.ts` | Vérification JWT Clerk uniquement |
| `packages/worker/src/index.ts` | Worker fetch handler + routing |
| `packages/worker/src/tools.ts` | MCP tools (workspace, collab) |
| `packages/worker/src/storage.ts` | D1Storage |
| `apps/desktop/electron/services/auth.ts` | PKCE + safeStorage |
| `apps/desktop/electron/main.ts` | deep link handler + IPC |
| `apps/website/` | Next.js + Clerk + Stripe (à scaffolder) |
