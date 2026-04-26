import { useTranslation } from 'react-i18next';
import type { DensityPreference } from '@nakiros/shared';
import { DEFAULT_ACCENT_HUE, DEFAULT_DENSITY } from '@nakiros/shared';
import { usePreferences } from '../../hooks/usePreferences';

const DENSITY_OPTIONS: DensityPreference[] = ['compact', 'standard', 'comfy'];
const ACCENT_PRESETS = [195, 165, 240, 295, 80, 25];

/**
 * App-wide appearance preferences for the new-design token system.
 * Drives `data-density` and the four `--n-accent*` OKLch CSS vars on the
 * document root via the effect in `App.tsx`. Persists to
 * `~/.nakiros/preferences.json` through the `preferences:save` IPC channel.
 */
export function AppearanceSettings() {
  const { t } = useTranslation('settings');
  const { preferences, updatePreferences } = usePreferences();

  const density = preferences.density ?? DEFAULT_DENSITY;
  const hue = preferences.accentHue ?? DEFAULT_ACCENT_HUE;

  const setDensity = (next: DensityPreference) => {
    void updatePreferences({ ...preferences, density: next });
  };

  const setHue = (next: number) => {
    void updatePreferences({ ...preferences, accentHue: next });
  };

  return (
    <section className="rounded-md border border-[var(--line)] bg-[var(--bg-card)] p-5">
      <h3 className="text-base font-semibold text-[var(--text)]">{t('appearanceTitle')}</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{t('appearanceDescription')}</p>

      <div className="mt-5 space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--text)]">
            {t('densityTitle')}
          </label>
          <div className="inline-flex rounded-md border border-[var(--line)] bg-[var(--bg-soft)] p-1">
            {DENSITY_OPTIONS.map((opt) => {
              const active = density === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setDensity(opt)}
                  aria-pressed={active}
                  className={
                    'rounded px-3 py-1.5 text-sm transition-colors ' +
                    (active
                      ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]')
                  }
                >
                  {t(
                    opt === 'standard'
                      ? 'densityStandard'
                      : opt === 'compact'
                        ? 'densityCompact'
                        : 'densityComfy',
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-[var(--text)]">{t('accentTitle')}</label>
            <button
              type="button"
              onClick={() => setHue(DEFAULT_ACCENT_HUE)}
              className="text-xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
            >
              {t('accentReset')}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={360}
              step={5}
              value={hue}
              onChange={(e) => setHue(Number(e.target.value))}
              aria-label={t('accentHueLabel')}
              className="flex-1 accent-[var(--primary)]"
            />
            <span className="w-12 text-right font-mono text-sm tabular-nums text-[var(--text-muted)]">
              {hue}°
            </span>
          </div>

          <div className="mt-3 flex gap-2">
            {ACCENT_PRESETS.map((h) => {
              const active = hue === h;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHue(h)}
                  aria-label={`hue ${h}`}
                  aria-pressed={active}
                  className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    background: `oklch(0.78 0.10 ${h})`,
                    borderColor: active ? 'var(--text)' : 'transparent',
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
