# Ticket — Auto-update de l'application Nakiros via electron-updater et Cloudflare R2

## Contexte

L'application Nakiros est une app Electron distribuée via .dmg (macOS) et .exe (Windows). Aujourd'hui les mises à jour nécessitent de télécharger et réinstaller manuellement le .dmg. Ce ticket met en place un système d'auto-update natif via `electron-updater` hébergé sur Cloudflare R2, avec les mêmes canaux stable/beta que les agents et workflows.

## Prérequis — Certificats de signature (BLOQUANT)

L'auto-update sur macOS et Windows nécessite des certificats de signature. Sans ça Gatekeeper (macOS) et SmartScreen (Windows) bloquent l'installation.

**À obtenir avant la première release publique :**

| Plateforme | Certificat | Coût approximatif |
|---|---|---|
| macOS | Apple Developer Program | 99€/an |
| Windows | Code Signing Certificate | 100-400€/an selon provider |

**En attendant les certificats :**
- Le GitHub Action est implémenté complet mais les étapes de signature sont commentées
- Les variables d'environnement de signature sont définies comme secrets GitHub vides
- Quand les certificats sont disponibles, décommenter les étapes et renseigner les secrets

---

## Stack

- `electron-updater` — librairie de mise à jour native pour Electron
- Cloudflare R2 — hébergement des binaires et fichiers de release
- Cloudflare Worker existant (`updates.nakiros.com`) — endpoint app ajouté
- GitHub Actions — build, signature et push automatiques sur tag

---

## Structure R2 — App releases

Dans le bucket `nakiros-assets` existant, ajouter :

```
nakiros-assets/
  app/
    stable/
      latest-mac.yml           ← lu par electron-updater (macOS)
      latest.yml               ← lu par electron-updater (Windows)
      latest-linux.yml         ← lu par electron-updater (Linux)
      Nakiros-1.2.0.dmg        ← binaire macOS
      Nakiros-1.2.0.dmg.blockmap
      Nakiros-Setup-1.2.0.exe  ← binaire Windows
      Nakiros-1.2.0.AppImage   ← binaire Linux
    beta/
      latest-mac.yml
      latest.yml
      latest-linux.yml
      Nakiros-1.2.0-beta.1.dmg
      ...
```

### Format latest-mac.yml (généré automatiquement par electron-builder)

```yaml
version: 1.2.0
files:
  - url: Nakiros-1.2.0.dmg
    sha512: {hash}
    size: {size}
path: Nakiros-1.2.0.dmg
sha512: {hash}
releaseDate: '2026-03-04T10:00:00.000Z'
```

---

## Configuration electron-updater dans l'app

### Installation

```bash
npm install electron-updater --workspace=apps/desktop
```

### Configuration dans electron-builder.yml

```yaml
publish:
  provider: generic
  url: https://updates.nakiros.com/app/${channel}
  channel: stable
```

### Initialisation dans le main process Electron

```typescript
import { autoUpdater } from 'electron-updater'

// Configurer le channel selon les settings utilisateur
const channel = getUserChannel() // 'stable' ou 'beta'
autoUpdater.channel = channel

// Headers de sécurité — même système que les agents
autoUpdater.requestHeaders = {
  'X-Nakiros-Key': process.env.NAKIROS_API_KEY,
  'User-Agent': `Nakiros/${app.getVersion()} (${process.platform}; ${process.arch})`
}

// Désactiver l'auto-install au quit pour laisser l'utilisateur choisir
autoUpdater.autoInstallOnAppQuit = false

// Check au démarrage si dernière vérification > 24h
const lastCheck = getLastUpdateCheck()
const shouldCheck = !lastCheck || Date.now() - lastCheck > 24 * 60 * 60 * 1000

if (shouldCheck) {
  autoUpdater.checkForUpdates()
  saveLastUpdateCheck(Date.now())
}

// Events
autoUpdater.on('update-available', (info) => {
  // Notifier le renderer process
  mainWindow.webContents.send('update-available', info)
})

autoUpdater.on('update-downloaded', (info) => {
  // Notifier le renderer process
  mainWindow.webContents.send('update-downloaded', info)
})

autoUpdater.on('error', (error) => {
  // Log silencieux — ne pas bloquer l'app
  console.error('Auto-update error:', error)
})
```

---

## Endpoint Worker — App updates

Ajouter au Worker existant `updates.nakiros.com` :

### GET /app/:channel/latest-mac.yml
### GET /app/:channel/latest.yml
### GET /app/:channel/latest-linux.yml

Sert les fichiers yml depuis R2 avec les mêmes headers de sécurité que les agents.

```typescript
// Dans le Worker existant, ajouter le routing app
if (url.pathname.startsWith('/app/')) {
  return handleAppUpdate(request, env)
}

async function handleAppUpdate(request, env) {
  // Vérifier X-Nakiros-Key et User-Agent (même logique que /manifest)
  const authError = validateAuth(request, env)
  if (authError) return authError

  // Extraire channel et filename depuis le path
  // /app/stable/latest-mac.yml → channel=stable, file=latest-mac.yml
  const [, , channel, filename] = url.pathname.split('/')

  if (!['stable', 'beta'].includes(channel)) {
    return new Response(JSON.stringify({ error: 'INVALID_CHANNEL' }), { status: 400 })
  }

  // Servir depuis R2
  const object = await env.R2_BUCKET.get(`app/${channel}/${filename}`)
  if (!object) {
    return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404 })
  }

  return new Response(object.body, {
    headers: { 'Content-Type': 'text/yaml' }
  })
}
```

### GET /app/:channel/:filename

Sert les binaires (.dmg, .exe, .AppImage, .blockmap) depuis R2.

```typescript
// Même logique mais pour les binaires
const contentTypes = {
  '.dmg': 'application/x-apple-diskimage',
  '.exe': 'application/x-msdownload',
  '.AppImage': 'application/x-executable',
  '.blockmap': 'application/octet-stream'
}
```

---

## GitHub Action — Build et release

Créer `.github/workflows/release-app.yml`

### Déclencheur

```yaml
on:
  push:
    tags:
      - 'v*.*.*'          # ex: v1.2.0 → channel stable
      - 'v*.*.*-beta.*'   # ex: v1.2.0-beta.1 → channel beta
```

### Détection automatique du channel depuis le tag

```yaml
- name: Detect channel
  id: channel
  run: |
    if [[ "${{ github.ref_name }}" == *"-beta"* ]]; then
      echo "channel=beta" >> $GITHUB_OUTPUT
    else
      echo "channel=stable" >> $GITHUB_OUTPUT
    fi
```

### Étapes du workflow

```yaml
jobs:
  release:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Detect channel
        id: channel
        run: |
          if [[ "${{ github.ref_name }}" == *"-beta"* ]]; then
            echo "channel=beta" >> $GITHUB_OUTPUT
          else
            echo "channel=stable" >> $GITHUB_OUTPUT
          fi

      # ── Signature macOS (décommenter quand certificat disponible) ──
      # - name: Import Apple certificate
      #   env:
      #     APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
      #     APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
      #   run: |
      #     echo $APPLE_CERTIFICATE | base64 --decode > certificate.p12
      #     security import certificate.p12 -P $APPLE_CERTIFICATE_PASSWORD

      # ── Signature Windows (décommenter quand certificat disponible) ──
      # - name: Sign Windows build
      #   env:
      #     WINDOWS_CERTIFICATE: ${{ secrets.WINDOWS_CERTIFICATE }}

      - name: Build Electron app
        env:
          CHANNEL: ${{ steps.channel.outputs.channel }}
          NAKIROS_API_KEY: ${{ secrets.NAKIROS_API_KEY_STABLE }}
          # GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # APPLE_ID: ${{ secrets.APPLE_ID }}
          # APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          # APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: npm run build:electron -- --channel=$CHANNEL

      - name: Push to R2
        env:
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_R2_ACCESS_KEY_ID: ${{ secrets.CLOUDFLARE_R2_ACCESS_KEY_ID }}
          CLOUDFLARE_R2_SECRET_ACCESS_KEY: ${{ secrets.CLOUDFLARE_R2_SECRET_ACCESS_KEY }}
          CHANNEL: ${{ steps.channel.outputs.channel }}
          VERSION: ${{ github.ref_name }}
        run: node scripts/push-release-to-r2.js
```

### Script push-release-to-r2.js

```
1. Lire le channel et la version depuis les variables d'environnement
2. Vérifier que la version n'existe pas déjà sur R2
3. Uploader les binaires dans app/{channel}/
4. Uploader les fichiers .yml dans app/{channel}/
5. Logger le succès
```

---

## UI — Notification de mise à jour dans l'app

### Notification discrète dans le header (mise à jour disponible)

```
🔄 Nakiros v1.2.0 disponible  [Installer]  [×]
```

- Non bloquante
- [×] ferme pour la session
- Réapparaît au prochain démarrage

### Modal de confirmation (mise à jour téléchargée)

Quand `update-downloaded` est reçu :

```
┌─────────────────────────────────────────┐
│  Nakiros v1.2.0 est prêt                │
│                                         │
│  La mise à jour a été téléchargée.      │
│  Redémarrez l'application pour          │
│  l'installer.                           │
│                                         │
│  [Redémarrer maintenant]  [Plus tard]   │
└─────────────────────────────────────────┘
```

"Redémarrer maintenant" appelle `autoUpdater.quitAndInstall()`
"Plus tard" ferme le modal — la mise à jour s'installe au prochain redémarrage

### Dans les Settings globaux — section Application

```
┌─────────────────────────────────────────────────────────┐
│ Application                                              │
│                                                          │
│ Version installée    1.0.0                               │
│ Channel              [stable ▼]                          │
│ Dernière vérification  il y a 3 heures                   │
│                                                          │
│ [Vérifier les mises à jour]                              │
└─────────────────────────────────────────────────────────┘
```

Même états que la section Agents & Workflows du Ticket 3 :
- Vérification en cours
- À jour
- Mise à jour disponible + changelog
- Mise à jour téléchargée + bouton redémarrer
- Erreur réseau

---

## GitHub Secrets requis

```
# Existants (Ticket 1)
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_R2_ACCESS_KEY_ID
CLOUDFLARE_R2_SECRET_ACCESS_KEY

# Nouveaux — App signing (laisser vides jusqu'à obtention des certificats)
APPLE_CERTIFICATE              # Base64 du .p12
APPLE_CERTIFICATE_PASSWORD     # Mot de passe du .p12
APPLE_ID                       # apple@email.com
APPLE_APP_SPECIFIC_PASSWORD    # App-specific password Apple
APPLE_TEAM_ID                  # Team ID Apple Developer
WINDOWS_CERTIFICATE            # Base64 du certificat Windows
```

---

## Processus de release — Résumé

```
1. Développement terminé sur une branche feature
2. Merge sur main
3. Créer un tag Git :
   git tag v1.2.0        ← release stable
   git tag v1.2.0-beta.1 ← release beta
   git push origin --tags
4. GitHub Action se déclenche automatiquement
5. Build sur macOS, Windows et Linux en parallèle
6. Push des binaires et fichiers yml sur R2
7. Les apps des utilisateurs détectent la mise à jour
   au prochain démarrage (si last_check > 24h)
   ou immédiatement si check manuel dans les Settings
```

---

## Ce qu'il ne faut pas toucher

- La logique de mise à jour des agents/workflows — Tickets 1, 2 et 3
- Le Worker existant — uniquement ajouter le routing `/app/`
- Le reste des Settings globaux