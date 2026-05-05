import { useI18n, type Locale } from '@/i18n/I18nProvider';
import { cn } from '@/lib/utils';

/**
 * Compact EN/FR locale toggle rendered in the {@link Navbar}.
 *
 * Reads `locale`, `setLocale`, and `availableLocales` from {@link useI18n}
 * and highlights the active locale. Switching the locale is handled by
 * `I18nProvider`, which persists the choice to `localStorage`.
 */
export function LanguageSwitcher() {
  const { locale, setLocale, availableLocales } = useI18n();

  return (
    <div
      className="lp-mono inline-flex items-center gap-0.5 rounded-md p-0.5 text-[11px] uppercase"
      style={{
        background: 'var(--bg-sunken)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {availableLocales.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code as Locale)}
          className={cn('rounded px-2.5 py-1 transition-colors')}
          style={{
            background: code === locale ? 'var(--bg-raised)' : 'transparent',
            color: code === locale ? 'var(--accent)' : 'var(--fg-faint)',
            border: 'none',
            cursor: 'pointer',
            letterSpacing: '0.06em',
          }}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
