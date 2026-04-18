import { Check, Github } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

export function OpenSource() {
  const { messages } = useI18n();

  return (
    <section className="border-b border-[#1A1A1A] bg-[#080808] py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="font-mono text-3xl text-[#F0F0F0] sm:text-4xl">
              {messages.openSource.title}
            </h2>
            <p className="mt-5 leading-relaxed text-[#F0F0F0]/70">
              {messages.openSource.description}
            </p>
            <a
              href="https://github.com/"
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[#1A1A1A] bg-[#111111] px-5 py-2.5 text-sm text-[#F0F0F0] transition-all hover:border-[#0D9E9E] hover:bg-[#1A1A1A]"
            >
              <Github className="h-4 w-4" />
              {messages.openSource.cta}
            </a>
          </div>

          <ul className="space-y-3">
            {messages.openSource.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2ECFCF]/10 text-[#2ECFCF]">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                <span className="leading-relaxed text-[#F0F0F0]/80">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
