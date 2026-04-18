import { Compass, ClipboardCheck, FlaskConical, Wrench } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';

const ICONS = [Compass, ClipboardCheck, FlaskConical, Wrench];

export function Features() {
  const { messages } = useI18n();

  return (
    <section id="features" className="border-b border-[#1A1A1A] bg-[#080808] py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-mono text-3xl text-[#F0F0F0] sm:text-4xl">
            {messages.features.title}
          </h2>
          <p className="mt-5 leading-relaxed text-[#F0F0F0]/70">
            {messages.features.description}
          </p>
        </div>

        <div className="mt-16 grid gap-5 sm:grid-cols-2">
          {messages.features.items.map((feature, i) => {
            const Icon = ICONS[i] ?? Compass;
            return (
              <div
                key={feature.title}
                className="group relative overflow-hidden rounded-xl border border-[#1A1A1A] bg-[#111111] p-7 transition-all hover:border-[#0D9E9E] hover:bg-[#0D0D0D]"
              >
                <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#2ECFCF]/20 bg-[#2ECFCF]/10 text-[#2ECFCF]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-mono text-xl text-[#F0F0F0]">{feature.title}</h3>
                <p className="mt-3 leading-relaxed text-[#F0F0F0]/70">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
