import { useI18n, type Locale } from '@/i18n/I18nProvider';
import { cn } from '@/lib/utils';

export function LanguageSwitcher() {
  const { locale, setLocale, availableLocales } = useI18n();

  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-[#1A1A1A] bg-[#111111] p-0.5 text-xs font-mono uppercase">
      {availableLocales.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code as Locale)}
          className={cn(
            'rounded px-2 py-1 transition-colors',
            code === locale
              ? 'bg-[#1A1A1A] text-[#2ECFCF]'
              : 'text-[#F0F0F0]/60 hover:text-[#F0F0F0]',
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
