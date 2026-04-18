import { NakirosLogo } from './NakirosLogo';
import { useI18n } from '@/i18n/I18nProvider';

export function Footer() {
  const { messages } = useI18n();

  return (
    <footer className="bg-[#080808] py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <NakirosLogo className="h-6 w-6" />
            <div>
              <p className="font-mono text-sm font-bold text-[#F0F0F0]">nakiros</p>
              <p className="text-xs text-[#F0F0F0]/50">{messages.footer.tagline}</p>
            </div>
          </div>

          <div className="text-sm text-[#F0F0F0]/50 md:text-right">
            <p>{messages.footer.builtWith}</p>
            <p className="mt-1 font-mono text-xs">{messages.footer.copyright}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
