import { Github } from 'lucide-react';
import { InstallCommand } from './InstallCommand';
import { useI18n } from '@/i18n/I18nProvider';

export function FinalCta() {
  const { messages } = useI18n();

  return (
    <section id="install" className="border-b border-[#1A1A1A] bg-[#111111] py-24">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="font-mono text-3xl text-[#F0F0F0] sm:text-4xl">{messages.cta.title}</h2>
        <p className="mt-5 leading-relaxed text-[#F0F0F0]/70">{messages.cta.description}</p>

        <div className="mt-10 flex flex-col items-center gap-4">
          <InstallCommand command={messages.cta.command} />

          <div className="flex items-center gap-3 font-mono text-sm text-[#F0F0F0]/60">
            <span className="text-[#F0F0F0]/30">{messages.cta.then}</span>
            <span className="rounded-md border border-[#1A1A1A] bg-[#0D0D0D] px-2 py-0.5 text-[#2ECFCF]">
              $ {messages.cta.then2}
            </span>
          </div>
        </div>

        <div className="mt-10">
          <a
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[#F0F0F0]/60 transition-colors hover:text-[#F0F0F0]"
          >
            <Github className="h-4 w-4" />
            {messages.cta.github}
          </a>
        </div>
      </div>
    </section>
  );
}
