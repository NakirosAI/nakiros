Place your branded app icons here:

- macOS: `app.icns`
- Windows: `app.ico`
- Optional source image: `app.png` (1024x1024 recommended)

Notes:
- `app.icns` is used by Electron Forge for macOS app and DMG branding.
- `src/assets/icon.svg` is used at runtime for BrowserWindow / dock icon fallback.
- If `app.icns` is missing on macOS, Forge auto-generates one from `app.png` (preferred) or `src/assets/icon.svg`.
