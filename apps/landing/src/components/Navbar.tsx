import { Github } from 'lucide-react';
import { NakirosLogo } from './NakirosLogo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useI18n } from '@/i18n/I18nProvider';

export function Navbar() {
  const { messages } = useI18n();

  return (
    <header className="sticky top-0 z-50 border-b border-[#1A1A1A] bg-[#080808]/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2.5 text-[#F0F0F0]">
          <NakirosLogo className="h-6 w-6" />
          <span className="font-mono text-sm font-bold">nakiros</span>
        </a>

        <div className="hidden items-center gap-6 md:flex">
          <a href="#etymology" className="text-sm text-[#F0F0F0]/70 transition-colors hover:text-[#F0F0F0]">
            {messages.navbar.etymology}
          </a>
          <a href="#features" className="text-sm text-[#F0F0F0]/70 transition-colors hover:text-[#F0F0F0]">
            {messages.navbar.features}
          </a>
          <a href="#how-it-works" className="text-sm text-[#F0F0F0]/70 transition-colors hover:text-[#F0F0F0]">
            {messages.navbar.howItWorks}
          </a>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <a
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="rounded-md p-2 text-[#F0F0F0]/70 transition-colors hover:bg-[#1A1A1A] hover:text-[#F0F0F0]"
          >
            <Github className="h-4 w-4" />
          </a>
          <a
            href="#install"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0D9E9E] px-4 py-2 text-sm font-medium text-[#F0F0F0] transition-all hover:bg-[#2ECFCF]"
          >
            {messages.navbar.install}
          </a>
        </div>
      </nav>
    </header>
  );
}
