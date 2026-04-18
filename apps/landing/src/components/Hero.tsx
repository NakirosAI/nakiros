import { ArrowRight } from 'lucide-react';
import { InstallCommand } from './InstallCommand';
import { useI18n } from '@/i18n/I18nProvider';

export function Hero() {
  const { messages } = useI18n();

  return (
    <section id="top" className="relative overflow-hidden border-b border-[#1A1A1A] bg-[#080808] pt-32 pb-24">
      {/* Subtle radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse at 30% 0%, rgba(46, 207, 207, 0.15), transparent 60%)',
        }}
      />

      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#2ECFCF]/30 bg-[#2ECFCF]/5 px-4 py-1.5 font-mono text-xs text-[#2ECFCF]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2ECFCF] animate-pulse" />
          {messages.hero.eyebrow}
        </span>

        <h1 className="font-mono text-4xl leading-[1.15] text-[#F0F0F0] sm:text-5xl lg:text-6xl">
          {messages.hero.titleLine1}
          <br />
          <span className="text-[#2ECFCF]">{messages.hero.titleAccent}</span>
          <br />
          {messages.hero.titleLine2}
        </h1>

        <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-[#F0F0F0]/70">
          {messages.hero.description}
        </p>

        <div className="mt-12 flex flex-col items-center gap-4">
          <InstallCommand
            command={messages.hero.installCommand}
            label={messages.hero.installLabel}
            packageName="@nakirosai/nakiros"
          />
          <p className="font-mono text-xs text-[#F0F0F0]/50">{messages.hero.installHint}</p>
        </div>

        <div className="mt-8 flex justify-center">
          <a
            href="#how-it-works"
            className="group inline-flex items-center gap-2 text-sm text-[#F0F0F0]/60 transition-colors hover:text-[#F0F0F0]"
          >
            {messages.hero.secondaryCta}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
