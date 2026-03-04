const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const runtimeIconSvg = path.resolve(__dirname, 'src/assets/icon.svg');
const macIcon = path.resolve(__dirname, 'assets/icons/app.icns');
const winIcon = path.resolve(__dirname, 'assets/icons/app.ico');
const pngIcon = path.resolve(__dirname, 'assets/icons/app.png');
const nodePtyModule = path.resolve(__dirname, '../../node_modules/node-pty');
const generatedDir = path.resolve(__dirname, '.generated-icons');
const generatedMacIcon = path.resolve(generatedDir, 'app.icns');
const entitlementsPath = path.resolve(__dirname, 'electron/entitlements.mac.plist');
const entitlementsInheritPath = path.resolve(__dirname, 'electron/entitlements.mac.inherit.plist');

const extraResource = [path.resolve(__dirname, '_nakiros')];
if (fs.existsSync(runtimeIconSvg)) {
  extraResource.push(runtimeIconSvg);
}
if (fs.existsSync(nodePtyModule)) {
  extraResource.push(nodePtyModule);
}

function ensureGeneratedMacIcon() {
  if (process.platform !== 'darwin') return undefined;
  if (!fs.existsSync(runtimeIconSvg) && !fs.existsSync(pngIcon)) return undefined;

  fs.mkdirSync(generatedDir, { recursive: true });
  const png1024 = path.resolve(generatedDir, 'icon_1024x1024.png');
  const iconsetDir = path.resolve(generatedDir, 'app.iconset');
  fs.mkdirSync(iconsetDir, { recursive: true });

  try {
    if (fs.existsSync(pngIcon)) {
      execFileSync('sips', ['-z', '1024', '1024', pngIcon, '--out', png1024], { stdio: 'ignore' });
    } else {
      execFileSync('rsvg-convert', ['-w', '1024', '-h', '1024', '-o', png1024, runtimeIconSvg], { stdio: 'ignore' });
    }

    const sizes = [16, 32, 128, 256, 512];
    for (const size of sizes) {
      const normal = path.resolve(iconsetDir, `icon_${size}x${size}.png`);
      const retina = path.resolve(iconsetDir, `icon_${size}x${size}@2x.png`);
      execFileSync('sips', ['-z', String(size), String(size), png1024, '--out', normal], { stdio: 'ignore' });
      execFileSync('sips', ['-z', String(size * 2), String(size * 2), png1024, '--out', retina], { stdio: 'ignore' });
    }

    execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', generatedMacIcon], { stdio: 'ignore' });
    return generatedMacIcon;
  } catch {
    return undefined;
  }
}

const resolvedMacIcon = fs.existsSync(macIcon) ? macIcon : ensureGeneratedMacIcon();
const resolvedPackagerIcon = resolvedMacIcon ?? (fs.existsSync(winIcon) ? winIcon : undefined);
const isMac = process.platform === 'darwin';
const signingIdentity = process.env['APPLE_SIGN_IDENTITY'] ?? '';
const shouldSign = isMac && signingIdentity.length > 0;
const notarizeWithApiKey =
  (process.env['APPLE_API_KEY'] ?? '').length > 0 &&
  (process.env['APPLE_API_KEY_ID'] ?? '').length > 0 &&
  (process.env['APPLE_API_ISSUER'] ?? '').length > 0;
const notarizeWithPassword =
  (process.env['APPLE_ID'] ?? '').length > 0 &&
  (process.env['APPLE_APP_SPECIFIC_PASSWORD'] ?? '').length > 0 &&
  (process.env['APPLE_TEAM_ID'] ?? '').length > 0;
const shouldNotarize = isMac && shouldSign && (notarizeWithApiKey || notarizeWithPassword);

const osxSign = shouldSign
  ? {
    identity: signingIdentity,
    hardenedRuntime: true,
    entitlements: entitlementsPath,
    'entitlements-inherit': entitlementsInheritPath,
    'signature-flags': 'library',
  }
  : undefined;

const osxNotarize = !shouldNotarize
  ? undefined
  : notarizeWithApiKey
    ? {
      tool: 'notarytool',
      appleApiKey: process.env['APPLE_API_KEY'],
      appleApiKeyId: process.env['APPLE_API_KEY_ID'],
      appleApiIssuer: process.env['APPLE_API_ISSUER'],
    }
    : {
      tool: 'notarytool',
      appleId: process.env['APPLE_ID'],
      appleIdPassword: process.env['APPLE_APP_SPECIFIC_PASSWORD'],
      teamId: process.env['APPLE_TEAM_ID'],
    };

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
module.exports = {
  packagerConfig: {
    name: 'Nakiros',
    appBundleId: 'com.nakiros.desktop',
    helperBundleId: 'com.nakiros.desktop.helper',
    asar: true,
    prune: false,
    ignore: [/[\\/]node_modules[\\/]@nakiros([\\/]|$)/],
    extraResource,
    icon: resolvedPackagerIcon,
    osxSign,
    osxNotarize,
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32'],
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: shouldSign
        ? { 'signing-identity': signingIdentity }
        : {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
