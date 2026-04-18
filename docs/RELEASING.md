# Releasing Nakiros

This doc covers how to cut a new release of the `nakiros` npm package and how
the landing page gets deployed.

## Prerequisites (one-time setup)

### npm publish (Trusted Publishing / OIDC — no tokens)

Nakiros uses npm **Trusted Publishing**: the workflow authenticates to
npm via GitHub's OIDC tokens instead of a long-lived `NPM_TOKEN`. More
secure, less to rotate, automatically scoped to this workflow.

One-time setup on [npmjs.com](https://npmjs.com):

1. **Publish the very first version manually** (Trusted Publishing requires
   the package to already exist so you can configure its trusted publishers).
   From a machine where you're logged in with `npm login`:
   ```bash
   cd apps/nakiros
   pnpm build
   npm publish --access public --tag beta
   ```
2. Go to the package page → **Settings** → **Trusted publishers** → **Add**:
   - Publisher: **GitHub Actions**
   - Organization or user: `NakirosAI`
   - Repository: `nakiros`
   - Workflow filename: `release.yml`
   - Environment name: *(leave blank)*
3. From now on, every GitHub Release triggers the workflow, and publishes
   without needing any secret. You can also revoke/rotate the trusted
   publisher anytime without touching GitHub.

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

## Release flavors

The project uses [semver](https://semver.org) pre-releases to differentiate
unstable dev builds from stable releases. The publish workflow picks the npm
**dist-tag** automatically based on the version string:

| Version shape      | dist-tag  | Install command                   |
|--------------------|-----------|-----------------------------------|
| `0.1.0-beta.N`     | `beta`    | `npm i -g nakiros@beta`           |
| `0.1.0-alpha.N`    | `alpha`   | `npm i -g nakiros@alpha`          |
| `0.1.0-rc.N`       | `rc`      | `npm i -g nakiros@rc`             |
| `0.1.0` (no suffix)| `latest`  | `npm i -g nakiros`                |

`latest` is what `npm i -g nakiros` grabs by default. Pre-release dist-tags
require explicit opt-in, so a broken `beta` release never hits casual users.

## Cutting a release

1. Make sure `main` is green and you're at the right commit.
2. Bump `apps/nakiros/package.json` `"version"` field. Examples:
   - `0.1.0-beta.1` → `0.1.0-beta.2` (next beta iteration)
   - `0.1.0-beta.4` → `0.1.0` (first stable)
   - `0.1.0` → `0.2.0-beta.1` (breaking change, back to beta)
   - `0.1.0` → `0.1.1` (stable patch)
3. Commit:
   ```bash
   git commit -am "chore(nakiros): bump to v0.2.0-beta.1"
   git push
   ```
4. Create a **GitHub Release** with tag `v0.2.0-beta.1` (the `v` prefix must
   match the version in `apps/nakiros/package.json` exactly — the workflow
   refuses to publish otherwise).
5. The workflow runs automatically:
   - Verifies tag ↔ package version alignment
   - Detects dist-tag from version string
   - Runs `pnpm turbo build --filter nakiros`
   - Publishes to npm with `--provenance --access public --tag <dist-tag>`
6. Within a few minutes, the install command shown on the landing page
   updates automatically (the badge fetches `registry.npmjs.org/nakiros` and
   shows whichever pre-release tag is active when no `latest` exists).

## Rolling back

npm doesn't allow overwriting a published version. If a broken release ships:

- Publish a patch (`0.1.0-beta.2`, `0.1.1`, etc.) with the fix.
- If within 72h and the version was never downloaded, you can
  `npm unpublish nakiros@0.1.0-beta.1`. Otherwise
  `npm deprecate nakiros@0.1.0-beta.1 "Broken release, use 0.1.0-beta.2"`.

## Provenance

Every published version includes a signed attestation proving it was built
from this repo at the expected commit. Users can verify with:

```bash
npm audit signatures
```
