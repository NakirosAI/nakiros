# Releasing Nakiros

This doc covers how to cut a new release of the `nakiros` npm package and how
the landing page gets deployed.

## Prerequisites (one-time setup)

### npm publish

1. On [npmjs.com](https://npmjs.com), create an **automation token** with
   publish rights for the `nakiros` package.
2. In the GitHub repo settings → Secrets and variables → Actions, add:
   - `NPM_TOKEN` = the automation token above.
3. That's it. The workflow `.github/workflows/release.yml` handles the rest.

### Landing page (Cloudflare Pages)

1. In the Cloudflare dashboard → Pages → Create project → **Connect to Git**
   → select `NakirosAI/nakiros`.
2. Build settings:
   - **Framework preset:** None
   - **Build command:** `pnpm install && pnpm --filter @nakiros/landing build`
   - **Build output directory:** `apps/landing/dist`
   - **Root directory:** (leave blank — monorepo root)
3. Environment variables:
   - `NODE_VERSION=20`
4. Done. CF auto-rebuilds on push to `main`, and creates **preview URLs** for
   every PR that touches `apps/landing/**`.

## Cutting an npm release

1. Make sure `main` is green and you're at the right commit.
2. Bump `apps/nakiros/package.json` `"version"` field. Follow semver:
   - `0.x.y` for pre-1.0 (current).
   - Breaking change → bump minor while in 0.x.
   - Patch → bump patch.
3. Commit:
   ```bash
   git commit -am "chore(nakiros): bump to v0.2.0"
   git push
   ```
4. Create a **GitHub Release** with tag `v0.2.0` (must match the version in
   `apps/nakiros/package.json` exactly — the workflow refuses to publish
   otherwise).
5. The workflow runs automatically:
   - Verifies tag ↔ package version alignment
   - Installs deps with frozen lockfile
   - Runs `pnpm turbo build --filter nakiros`
   - Publishes to npm with `--provenance --access public`
6. Within a few minutes, `npm i -g nakiros@0.2.0` works, and the landing page
   will pick up the new version on its next page load (the badge fetches
   `registry.npmjs.org/nakiros/latest`).

## Rolling back

npm doesn't allow overwriting a published version. If a broken release ships:

- Publish a patch (`0.2.1`) with the fix.
- If within 72h and the version was never downloaded, you can `npm unpublish
  nakiros@0.2.0`. Otherwise `npm deprecate nakiros@0.2.0 "Use 0.2.1 — broken
  release"`.

## Provenance

Every published version includes a signed attestation proving it was built
from this repo at the expected commit. Users can verify with:

```bash
npm audit signatures
```
